import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, resolve } from "node:path";
import { promisify } from "node:util";

import YAML from "yaml";

import {
  clearLocalEbaySession,
  getBackendProfile,
  requireLocalEbaySession,
  upsertBackendProfile
} from "./backend-config.js";
import { DEFAULT_CALLBACK_PORT } from "./constants.js";
import { EbayApiClient, resolveEbayEnvironment } from "./ebay-api.js";
import {
  createListingDirect,
  endListingDirect,
  getConnectionStatusDirect,
  getListingDirect,
  listListingsDirect,
  optInPolicyProgramDirect,
  planCreateDirect,
  planEndDirect,
  planUpdateDirect,
  pullListingDirect,
  runDoctorDirect,
  syncPoliciesDirect,
  updateListingDirect,
  upsertLocationDirect,
  verifyCreateDirect
} from "./ebay-engine.js";
import { AppError } from "./errors.js";
import {
  type BackendProfile,
  type DoctorReportResponse,
  type EbayConnectionResponse,
  type ListingPatchRequest,
  type ListingSpecRequest,
  type ListingSummary,
  type LocalEbayAuthStartResponse,
  type LocalEbaySession,
  type MutationPlanResponse
} from "./backend-types.js";

const execFileAsync = promisify(execFile);

type JsonObject = Record<string, unknown>;

export function parseDataFile<T>(filePath: string): T {
  const fullPath = resolve(filePath);
  const source = readFileSync(fullPath, "utf8");
  const extension = extname(fullPath).toLowerCase();

  if (extension === ".yaml" || extension === ".yml") {
    return YAML.parse(source) as T;
  }

  return JSON.parse(source) as T;
}

export function writeDataFile(filePath: string, data: unknown): void {
  const fullPath = resolve(filePath);
  const extension = extname(fullPath).toLowerCase();
  const content =
    extension === ".yaml" || extension === ".yml"
      ? YAML.stringify(data)
      : `${JSON.stringify(data, null, 2)}\n`;

  writeFileSync(fullPath, content, "utf8");
}

export async function parseListingSpecFile(filePath: string): Promise<ListingSpecRequest> {
  return await normalizeListingSpec(parseDataFile<JsonObject>(filePath), dirname(resolve(filePath)));
}

export async function parseListingPatchFile(filePath: string): Promise<ListingPatchRequest> {
  return await normalizeListingPatch(parseDataFile<JsonObject>(filePath), dirname(resolve(filePath)));
}

export async function beginLocalEbayAuthorization(
  profile: BackendProfile,
  request: { environment: string; callbackUrl: string; marketplaceId?: string }
): Promise<LocalEbayAuthStartResponse> {
  return await postBackendJson<LocalEbayAuthStartResponse>(
    profile,
    "/api/local/ebay/authorize/start",
    {
      environment: request.environment,
      callbackUrl: request.callbackUrl,
      marketplaceId: request.marketplaceId ?? "EBAY_US"
    }
  );
}

export async function exchangeLocalEbayAuthorization(
  profile: BackendProfile,
  request: { state: string; code: string }
): Promise<LocalEbaySession> {
  return await postBackendJson<LocalEbaySession>(
    profile,
    "/api/local/ebay/authorize/exchange",
    request
  );
}

export async function refreshLocalEbaySession(profile: BackendProfile, session: LocalEbaySession): Promise<LocalEbaySession> {
  return await postBackendJson<LocalEbaySession>(
    profile,
    "/api/local/ebay/refresh",
    {
      environment: session.environment,
      marketplaceId: session.marketplaceId,
      refreshToken: session.refreshToken,
      refreshTokenExpiresAtUtc: session.refreshTokenExpiresAtUtc,
      defaultPaymentPolicyId: session.defaultPaymentPolicyId,
      defaultReturnPolicyId: session.defaultReturnPolicyId,
      defaultFulfillmentPolicyId: session.defaultFulfillmentPolicyId,
      defaultLocationKey: session.defaultLocationKey
    }
  );
}

export async function authenticateWithEbayLocally(
  profile: BackendProfile,
  options: { environment: string; marketplaceId?: string; shouldOpen?: boolean; timeoutMs?: number }
): Promise<{ session: LocalEbaySession; authorize: LocalEbayAuthStartResponse; opened: boolean; callbackUrl: string }> {
  const callback = await startBrowserCallbackServer(DEFAULT_CALLBACK_PORT);
  try {
    const authorize = await beginLocalEbayAuthorization(profile, {
      environment: options.environment,
      callbackUrl: callback.callbackUrl,
      marketplaceId: options.marketplaceId
    });
    const opened = options.shouldOpen === false ? false : await openBrowser(authorize.authorizeUrl);
    const result = await callback.waitForResult(options.timeoutMs ?? 180_000);
    if (result.error) {
      throw new AppError("BACKEND_ERROR", result.error);
    }
    if (result.state !== authorize.state) {
      throw new AppError("OAUTH_STATE_MISMATCH", "eBay authorization returned an unexpected state token.");
    }
    if (!result.code) {
      throw new AppError("AUTH_CODE_MISSING", "eBay authorization completed without an exchange code.");
    }

    return {
      session: await exchangeLocalEbayAuthorization(profile, { state: authorize.state, code: result.code }),
      authorize,
      opened,
      callbackUrl: callback.callbackUrl
    };
  } finally {
    await callback.close();
  }
}

async function ensureFreshLocalEbaySession(profile: BackendProfile): Promise<LocalEbaySession> {
  const latestPersistedProfile = getBackendProfile(profile.name);
  const session = requireLocalEbaySession(latestPersistedProfile ?? profile);
  const expiresAt = Date.parse(session.accessTokenExpiresAtUtc);
  if (Number.isNaN(expiresAt) || expiresAt > Date.now() + 60_000) {
    return session;
  }

  try {
    const refreshed = await refreshLocalEbaySession(profile, session);
    upsertBackendProfile({ name: profile.name, ebaySession: refreshed });
    return refreshed;
  } catch (error) {
    if (error instanceof AppError && error.code === "AUTH_REVOKED") {
      clearLocalEbaySession(profile.name);
    }
    throw error;
  }
}

async function withFreshLocalEbaySession<T>(
  profile: BackendProfile,
  action: (session: LocalEbaySession) => Promise<T>
): Promise<T> {
  const session = await ensureFreshLocalEbaySession(profile);
  try {
    return await action(session);
  } catch (error) {
    if (error instanceof AppError && error.code === "AUTH_REVOKED") {
      clearLocalEbaySession(profile.name);
    }
    throw error;
  }
}

export async function getLocalConnectionStatus(profile: BackendProfile): Promise<EbayConnectionResponse> {
  return await withFreshLocalEbaySession(profile, async (session) =>
    await getConnectionStatusDirect(createExecutionClient(session), session)
  );
}

export async function runLocalDoctor(profile: BackendProfile): Promise<DoctorReportResponse> {
  return await withFreshLocalEbaySession(profile, async (session) =>
    await runDoctorDirect(createExecutionClient(session), session)
  );
}

export async function syncLocalPolicies(
  profile: BackendProfile,
  options: {
    paymentPolicyId?: string;
    returnPolicyId?: string;
    fulfillmentPolicyId?: string;
    createFromFile?: string;
  }
): Promise<{ result: unknown; session: LocalEbaySession }> {
  return await withFreshLocalEbaySession(profile, async (session) => {
    const direct = await syncPoliciesDirect(createExecutionClient(session), session, {
      paymentPolicyId: options.paymentPolicyId,
      returnPolicyId: options.returnPolicyId,
      fulfillmentPolicyId: options.fulfillmentPolicyId,
      createPayload: options.createFromFile ? parseDataFile<unknown>(options.createFromFile) : undefined
    });
    const updatedSession = direct.session;
    upsertBackendProfile({ name: profile.name, ebaySession: updatedSession });
    return { result: direct.result, session: updatedSession };
  });
}

export async function optInLocalPolicyProgram(
  profile: BackendProfile,
  programType = "SELLING_POLICY_MANAGEMENT"
): Promise<unknown> {
  return await withFreshLocalEbaySession(profile, async (session) =>
    await optInPolicyProgramDirect(createExecutionClient(session), session, programType)
  );
}

export async function createOrSetLocalLocation(
  profile: BackendProfile,
  options: { key?: string; file?: string }
): Promise<{ result: unknown; session: LocalEbaySession }> {
  return await withFreshLocalEbaySession(profile, async (session) => {
    const direct = await upsertLocationDirect(createExecutionClient(session), session, {
      key: options.key,
      payload: options.file ? parseDataFile<unknown>(options.file) : undefined
    });
    const updatedSession = direct.session;
    upsertBackendProfile({ name: profile.name, ebaySession: updatedSession });
    return { result: direct.result, session: updatedSession };
  });
}

export async function listLocalListings(
  profile: BackendProfile,
  options?: { status?: string; page?: number; limit?: number; days?: number }
): Promise<ListingSummary[]> {
  return await withFreshLocalEbaySession(profile, async (session) =>
    await listListingsDirect(createExecutionClient(session), session, options)
  );
}

export async function getLocalListing(profile: BackendProfile, reference: string): Promise<unknown> {
  return await withFreshLocalEbaySession(profile, async (session) =>
    await getListingDirect(createExecutionClient(session), session, reference)
  );
}

export async function pullLocalListing(profile: BackendProfile, reference: string, outputPath: string): Promise<unknown> {
  return await withFreshLocalEbaySession(profile, async (session) => {
    const spec = await pullListingDirect(createExecutionClient(session), session, reference);
    writeDataFile(outputPath, spec);
    return spec;
  });
}

export async function createLocalListingPlan(profile: BackendProfile, request: ListingSpecRequest): Promise<MutationPlanResponse> {
  return await withFreshLocalEbaySession(profile, async (session) => planCreateDirect(session, request));
}

export async function createLocalListing(profile: BackendProfile, request: ListingSpecRequest): Promise<unknown> {
  return await withFreshLocalEbaySession(profile, async (session) =>
    await createListingDirect(createExecutionClient(session), session, request)
  );
}

export async function verifyLocalListingCreate(profile: BackendProfile, request: ListingSpecRequest): Promise<unknown> {
  return await withFreshLocalEbaySession(profile, async (session) =>
    await verifyCreateDirect(createExecutionClient(session), session, request)
  );
}

export async function updateLocalListingPlan(profile: BackendProfile, reference: string, request: ListingPatchRequest): Promise<MutationPlanResponse> {
  return await withFreshLocalEbaySession(profile, async (session) =>
    await planUpdateDirect(createExecutionClient(session), session, reference, request)
  );
}

export async function updateLocalListing(profile: BackendProfile, reference: string, request: ListingPatchRequest): Promise<unknown> {
  return await withFreshLocalEbaySession(profile, async (session) =>
    await updateListingDirect(createExecutionClient(session), session, reference, request)
  );
}

export async function endLocalListingPlan(profile: BackendProfile, reference: string): Promise<MutationPlanResponse> {
  return await withFreshLocalEbaySession(profile, async (session) =>
    await planEndDirect(createExecutionClient(session), session, reference)
  );
}

export async function endLocalListing(profile: BackendProfile, reference: string): Promise<unknown> {
  return await withFreshLocalEbaySession(profile, async (session) =>
    await endListingDirect(createExecutionClient(session), session, reference)
  );
}

function createExecutionClient(session: LocalEbaySession): EbayApiClient {
  return new EbayApiClient(resolveEbayEnvironment(session.environment));
}

async function postBackendJson<T>(profile: BackendProfile, path: string, payload: unknown): Promise<T> {
  const baseUrl = profile.backendBaseUrl?.replace(/\/$/, "");
  if (!baseUrl) {
    throw new AppError("CONFIG_ERROR", "A backend URL is required for backend-assisted auth relay.");
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(payload)
  });

  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const title = typeof body === "object" && body !== null && "title" in body && typeof body.title === "string"
      ? body.title
      : "";
    const detail = typeof body === "object" && body !== null && "detail" in body && typeof body.detail === "string"
      ? body.detail
      : typeof body === "string" && body.length > 0
        ? body
        : `Backend request failed with status ${response.status}.`;
    if (response.status === 401 || title === "local_ebay_auth_revoked" || title === "local_ebay_reauth_required") {
      throw new AppError(
        "AUTH_REVOKED",
        `${detail} Run \`ebay auth login --environment production --json\` to reconnect.`,
        {
          backendStatus: response.status,
          backendTitle: title,
          backend: body,
          nextCommands: [
            "ebay auth login --environment production --json",
            "ebay status --json"
          ]
        }
      );
    }
    throw new AppError("BACKEND_ERROR", detail, body);
  }

  return body as T;
}

export async function openBrowser(url: string): Promise<boolean> {
  try {
    if (process.platform === "darwin") {
      await execFileAsync("open", [url]);
      return true;
    }

    if (process.platform === "win32") {
      await execFileAsync("cmd", ["/c", "start", "", url]);
      return true;
    }

    await execFileAsync("xdg-open", [url]);
    return true;
  } catch {
    return false;
  }
}

async function normalizeListingSpec(raw: JsonObject, baseDir: string): Promise<ListingSpecRequest> {
  return {
    sku: asString(raw.sku, "sku"),
    writePath: normalizeWritePath(raw.writePath),
    marketplaceId: optionalString(raw.marketplaceId),
    title: asString(raw.title, "title"),
    description: asString(raw.description, "description"),
    categoryId: asString(raw.categoryId, "categoryId"),
    condition: asString(raw.condition, "condition"),
    conditionDescription: optionalString(raw.conditionDescription),
    format: optionalString(raw.format),
    priceValue: readPriceValue(raw),
    priceCurrency: readPriceCurrency(raw),
    availableQuantity: asNumber(raw.availableQuantity, "availableQuantity"),
    policies: normalizePolicies(raw.policies),
    locationKey: optionalString(raw.locationKey),
    location: optionalString(raw.location),
    postalCode: optionalString(raw.postalCode),
    country: optionalString(raw.country),
    dispatchTimeMax: optionalNumber(raw.dispatchTimeMax),
    bestOfferEnabled: optionalBoolean(raw.bestOfferEnabled),
    minimumBestOfferPrice: optionalNumber(raw.minimumBestOfferPrice),
    autoAcceptPrice: optionalNumber(raw.autoAcceptPrice),
    images: await normalizeImages(raw.images, baseDir),
    aspects: normalizeAspects(raw.aspects),
    packageWeightAndSize: raw.packageWeightAndSize,
    conditionDescriptors: normalizeConditionDescriptors(raw.conditionDescriptors),
    locale: optionalString(raw.locale)
  };
}

async function normalizeListingPatch(raw: JsonObject, baseDir: string): Promise<ListingPatchRequest> {
  const request: ListingPatchRequest = {};
  if ("sku" in raw) request.sku = optionalString(raw.sku);
  if ("writePath" in raw) request.writePath = normalizeWritePath(raw.writePath);
  if ("marketplaceId" in raw) request.marketplaceId = optionalString(raw.marketplaceId);
  if ("title" in raw) request.title = optionalString(raw.title);
  if ("description" in raw) request.description = optionalString(raw.description);
  if ("categoryId" in raw) request.categoryId = optionalString(raw.categoryId);
  if ("condition" in raw) request.condition = optionalString(raw.condition);
  if ("conditionDescription" in raw) request.conditionDescription = optionalString(raw.conditionDescription);
  if ("format" in raw) request.format = optionalString(raw.format);
  if ("priceValue" in raw || "price" in raw) request.priceValue = readPriceValue(raw);
  if ("priceCurrency" in raw || "price" in raw) request.priceCurrency = readPriceCurrency(raw);
  if ("availableQuantity" in raw) request.availableQuantity = asNumber(raw.availableQuantity, "availableQuantity");
  if ("policies" in raw) request.policies = normalizePolicies(raw.policies);
  if ("locationKey" in raw) request.locationKey = optionalString(raw.locationKey);
  if ("location" in raw) request.location = optionalString(raw.location);
  if ("postalCode" in raw) request.postalCode = optionalString(raw.postalCode);
  if ("country" in raw) request.country = optionalString(raw.country);
  if ("dispatchTimeMax" in raw) request.dispatchTimeMax = optionalNumber(raw.dispatchTimeMax);
  if ("bestOfferEnabled" in raw) request.bestOfferEnabled = optionalBoolean(raw.bestOfferEnabled);
  if ("minimumBestOfferPrice" in raw) request.minimumBestOfferPrice = optionalNumber(raw.minimumBestOfferPrice);
  if ("autoAcceptPrice" in raw) request.autoAcceptPrice = optionalNumber(raw.autoAcceptPrice);
  if ("images" in raw) request.images = await normalizeImages(raw.images, baseDir);
  if ("aspects" in raw) request.aspects = normalizeAspects(raw.aspects);
  if ("packageWeightAndSize" in raw) request.packageWeightAndSize = raw.packageWeightAndSize;
  if ("conditionDescriptors" in raw) request.conditionDescriptors = normalizeConditionDescriptors(raw.conditionDescriptors);
  if ("locale" in raw) request.locale = optionalString(raw.locale);
  return request;
}

async function normalizeImages(value: unknown, baseDir: string) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new AppError("VALIDATION_ERROR", "`images` must be an array.");
  }

  const images = [];
  for (const item of value) {
    images.push(await normalizeImage(item, baseDir));
  }
  return images;
}

async function normalizeImage(value: unknown, baseDir: string) {
  if (typeof value === "string") {
    return normalizeImageString(value, baseDir);
  }

  if (!isRecord(value)) {
    throw new AppError("VALIDATION_ERROR", "Each image must be a string or object.");
  }

  if (typeof value.url === "string" && value.url.length > 0) {
    return { url: value.url };
  }

  if (typeof value.path === "string" && value.path.length > 0) {
    return normalizeImageString(value.path, baseDir);
  }

  if (typeof value.base64Content === "string" && value.base64Content.length > 0) {
    return {
      fileName: typeof value.fileName === "string" ? value.fileName : "image.bin",
      contentType: typeof value.contentType === "string" ? value.contentType : "application/octet-stream",
      base64Content: value.base64Content
    };
  }

  throw new AppError("VALIDATION_ERROR", "Each image object must include `url`, `path`, or `base64Content`.");
}

function normalizeImageString(value: string, baseDir: string) {
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return { url: value };
  }

  const fullPath = resolve(baseDir, value);
  const buffer = readFileSync(fullPath);
  return {
    fileName: basename(fullPath),
    contentType: guessContentType(fullPath),
    base64Content: buffer.toString("base64")
  };
}

function normalizePolicies(value: unknown) {
  if (!isRecord(value)) {
    return undefined;
  }

  return {
    ...(typeof value.paymentPolicyId === "string" ? { paymentPolicyId: value.paymentPolicyId } : {}),
    ...(typeof value.returnPolicyId === "string" ? { returnPolicyId: value.returnPolicyId } : {}),
    ...(typeof value.fulfillmentPolicyId === "string" ? { fulfillmentPolicyId: value.fulfillmentPolicyId } : {})
  };
}

function normalizeAspects(value: unknown) {
  if (!isRecord(value)) {
    return undefined;
  }

  const aspects: Record<string, string[]> = {};
  for (const [key, rawValues] of Object.entries(value)) {
    if (!Array.isArray(rawValues)) {
      continue;
    }

    aspects[key] = rawValues.filter((entry): entry is string => typeof entry === "string");
  }
  return aspects;
}

function normalizeConditionDescriptors(value: unknown) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new AppError("VALIDATION_ERROR", "`conditionDescriptors` must be an array.");
  }

  return value.map((descriptor, index) => {
    if (!isRecord(descriptor)) {
      throw new AppError("VALIDATION_ERROR", `conditionDescriptors[${index}] must be an object.`);
    }

    if (typeof descriptor.name !== "string" || descriptor.name.length === 0) {
      throw new AppError("VALIDATION_ERROR", `conditionDescriptors[${index}].name is required.`);
    }

    if (!Array.isArray(descriptor.values) || descriptor.values.length === 0) {
      throw new AppError("VALIDATION_ERROR", `conditionDescriptors[${index}].values must be a non-empty array.`);
    }

    const values = descriptor.values.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
    if (values.length !== descriptor.values.length) {
      throw new AppError("VALIDATION_ERROR", `conditionDescriptors[${index}].values must contain only non-empty strings.`);
    }

    return {
      name: descriptor.name,
      values
    };
  });
}

function normalizeWritePath(value: unknown): "INVENTORY" | "TRADING" | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toUpperCase();
  if (normalized === "INVENTORY" || normalized === "TRADING") {
    return normalized;
  }

  throw new AppError("VALIDATION_ERROR", "`writePath` must be either INVENTORY or TRADING.");
}

function optionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  throw new AppError("VALIDATION_ERROR", "Expected a numeric value.");
}

function optionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }

  throw new AppError("VALIDATION_ERROR", "Expected a boolean value.");
}

function readPriceValue(raw: JsonObject): number {
  if (typeof raw.priceValue === "number") {
    return raw.priceValue;
  }

  if (typeof raw.priceValue === "string") {
    return Number(raw.priceValue);
  }

  if (isRecord(raw.price) && (typeof raw.price.value === "number" || typeof raw.price.value === "string")) {
    return Number(raw.price.value);
  }

  throw new AppError("VALIDATION_ERROR", "Listing price is required.");
}

function readPriceCurrency(raw: JsonObject): string | undefined {
  if (typeof raw.priceCurrency === "string") {
    return raw.priceCurrency;
  }

  if (isRecord(raw.price) && typeof raw.price.currency === "string") {
    return raw.price.currency;
  }

  return undefined;
}

function asString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new AppError("VALIDATION_ERROR", `\`${field}\` is required.`);
  }

  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown, field: string): number {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string" && value.length > 0) {
    return Number(value);
  }

  throw new AppError("VALIDATION_ERROR", `\`${field}\` must be numeric.`);
}

function guessContentType(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    default:
      return "application/octet-stream";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toLocalSessionContext(session: LocalEbaySession) {
  return {
    environment: session.environment,
    marketplaceId: session.marketplaceId,
    accessToken: session.accessToken,
    defaultPaymentPolicyId: session.defaultPaymentPolicyId,
    defaultReturnPolicyId: session.defaultReturnPolicyId,
    defaultFulfillmentPolicyId: session.defaultFulfillmentPolicyId,
    defaultLocationKey: session.defaultLocationKey
  };
}

async function startBrowserCallbackServer(preferredPort: number): Promise<{
  callbackUrl: string;
  waitForResult: (timeoutMs: number) => Promise<{ code?: string; state?: string; error?: string }>;
  close: () => Promise<void>;
}> {
  let resolveResult: ((value: { code?: string; state?: string; error?: string }) => void) | undefined;
  let rejectResult: ((reason?: unknown) => void) | undefined;
  const resultPromise = new Promise<{ code?: string; state?: string; error?: string }>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const code = url.searchParams.get("code") ?? undefined;
    const state = url.searchParams.get("state") ?? undefined;
    const error = url.searchParams.get("error_description") ?? url.searchParams.get("error") ?? undefined;

    response.statusCode = error ? 400 : 200;
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(`
      <html>
        <body style="font-family: sans-serif; padding: 2rem;">
          <h1>${error ? "Sign-in failed" : "Sign-in complete"}</h1>
          <p>${escapeHtml(error ?? "You can close this window and return to the CLI.")}</p>
        </body>
      </html>
    `);

    resolveResult?.({ code, state, error });
  });

  const listen = async (port: number) =>
    await new Promise<number>((resolvePort, reject) => {
      const onError = (error: Error) => {
        server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        server.off("error", onError);
        const address = server.address();
        resolvePort(typeof address === "object" && address ? address.port : port);
      };

      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(port, "127.0.0.1");
    });

  let port: number;
  try {
    port = await listen(preferredPort);
  } catch (error) {
    const errno = error as NodeJS.ErrnoException;
    if (errno.code !== "EADDRINUSE") {
      throw error;
    }

    port = await listen(0);
  }

  return {
    callbackUrl: `http://127.0.0.1:${port}/callback`,
    waitForResult: async (timeoutMs: number) => {
      const timer = setTimeout(() => {
        rejectResult?.(
          new AppError(
            "AUTH_CALLBACK_TIMEOUT",
            "Timed out waiting for eBay authorization to finish. Retry `ebay auth login` and complete the browser flow."
          )
        );
      }, timeoutMs);

      try {
        return await resultPromise;
      } finally {
        clearTimeout(timer);
      }
    },
    close: async () => {
      if (!server.listening) {
        return;
      }

      await new Promise<void>((resolveClose, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolveClose();
        });
      });
    }
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}
