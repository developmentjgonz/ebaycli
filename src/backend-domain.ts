import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, resolve } from "node:path";
import { promisify } from "node:util";

import YAML from "yaml";

import { BackendApiClient } from "./backend-client.js";
import { getBackendProfile, requireLocalEbaySession, upsertBackendProfile } from "./backend-config.js";
import { DEFAULT_CALLBACK_PORT } from "./constants.js";
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
  return await new BackendApiClient(profile).post<LocalEbayAuthStartResponse>("/api/local/ebay/authorize/start", request);
}

export async function exchangeLocalEbayAuthorization(
  profile: BackendProfile,
  request: { state: string; code: string }
): Promise<LocalEbaySession> {
  return await new BackendApiClient(profile).post<LocalEbaySession>("/api/local/ebay/authorize/exchange", request);
}

export async function refreshLocalEbaySession(profile: BackendProfile, session: LocalEbaySession): Promise<LocalEbaySession> {
  return await new BackendApiClient(profile).post<LocalEbaySession>("/api/local/ebay/refresh", {
    environment: session.environment,
    refreshToken: session.refreshToken,
    marketplaceId: session.marketplaceId,
    defaultPaymentPolicyId: session.defaultPaymentPolicyId,
    defaultReturnPolicyId: session.defaultReturnPolicyId,
    defaultFulfillmentPolicyId: session.defaultFulfillmentPolicyId,
    defaultLocationKey: session.defaultLocationKey
  });
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

  const refreshed = await refreshLocalEbaySession(profile, session);
  upsertBackendProfile({ name: profile.name, ebaySession: refreshed });
  return refreshed;
}

export async function getLocalConnectionStatus(profile: BackendProfile): Promise<EbayConnectionResponse> {
  const session = await ensureFreshLocalEbaySession(profile);
  return await new BackendApiClient(profile).post<EbayConnectionResponse>("/api/local/ebay/status", {
    session: toLocalSessionContext(session)
  });
}

export async function runLocalDoctor(profile: BackendProfile): Promise<DoctorReportResponse> {
  const session = await ensureFreshLocalEbaySession(profile);
  return await new BackendApiClient(profile).post<DoctorReportResponse>("/api/local/ebay/setup/doctor", {
    session: toLocalSessionContext(session)
  });
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
  const session = await ensureFreshLocalEbaySession(profile);
  const payload = options.createFromFile
    ? {
        session: toLocalSessionContext(session),
        paymentPolicyId: options.paymentPolicyId,
        returnPolicyId: options.returnPolicyId,
        fulfillmentPolicyId: options.fulfillmentPolicyId,
        createPayload: parseDataFile<unknown>(options.createFromFile)
      }
    : {
        session: toLocalSessionContext(session),
        paymentPolicyId: options.paymentPolicyId,
        returnPolicyId: options.returnPolicyId,
        fulfillmentPolicyId: options.fulfillmentPolicyId
      };

  const result = await new BackendApiClient(profile).post<Record<string, unknown>>("/api/local/ebay/setup/policies/sync", payload);
  const defaults = isRecord(result.defaults) ? result.defaults : {};
  const updatedSession: LocalEbaySession = {
    ...session,
    defaultPaymentPolicyId: typeof defaults.paymentPolicyId === "string" ? defaults.paymentPolicyId : session.defaultPaymentPolicyId,
    defaultReturnPolicyId: typeof defaults.returnPolicyId === "string" ? defaults.returnPolicyId : session.defaultReturnPolicyId,
    defaultFulfillmentPolicyId: typeof defaults.fulfillmentPolicyId === "string" ? defaults.fulfillmentPolicyId : session.defaultFulfillmentPolicyId
  };
  upsertBackendProfile({ name: profile.name, ebaySession: updatedSession });
  return { result, session: updatedSession };
}

export async function optInLocalPolicyProgram(
  profile: BackendProfile,
  programType = "SELLING_POLICY_MANAGEMENT"
): Promise<unknown> {
  const session = await ensureFreshLocalEbaySession(profile);
  return await new BackendApiClient(profile).post("/api/local/ebay/setup/policies/opt-in", {
    session: toLocalSessionContext(session),
    programType
  });
}

export async function createOrSetLocalLocation(
  profile: BackendProfile,
  options: { key?: string; file?: string }
): Promise<{ result: unknown; session: LocalEbaySession }> {
  const session = await ensureFreshLocalEbaySession(profile);
  const result = await new BackendApiClient(profile).post<Record<string, unknown>>("/api/local/ebay/setup/location", {
    session: toLocalSessionContext(session),
    merchantLocationKey: options.key,
    ...(options.file ? { locationPayload: parseDataFile<unknown>(options.file) } : {})
  });
  const updatedSession: LocalEbaySession = {
    ...session,
    defaultLocationKey: typeof result.merchantLocationKey === "string" ? result.merchantLocationKey : session.defaultLocationKey
  };
  upsertBackendProfile({ name: profile.name, ebaySession: updatedSession });
  return { result, session: updatedSession };
}

export async function listLocalListings(
  profile: BackendProfile,
  options?: { status?: string; page?: number; limit?: number; days?: number }
): Promise<ListingSummary[]> {
  const session = await ensureFreshLocalEbaySession(profile);
  return await new BackendApiClient(profile).post<ListingSummary[]>("/api/local/ebay/listings/list", {
    session: toLocalSessionContext(session),
    status: options?.status,
    page: options?.page,
    limit: options?.limit,
    days: options?.days
  });
}

export async function getLocalListing(profile: BackendProfile, reference: string): Promise<unknown> {
  const session = await ensureFreshLocalEbaySession(profile);
  return await new BackendApiClient(profile).post("/api/local/ebay/listings/get", {
    session: toLocalSessionContext(session),
    reference
  });
}

export async function pullLocalListing(profile: BackendProfile, reference: string, outputPath: string): Promise<unknown> {
  const result = await getLocalListing(profile, reference) as { spec?: unknown };
  if (!isRecord(result) || result.spec === undefined) {
    throw new AppError("BACKEND_ERROR", "The backend did not return a listing spec.", result);
  }

  writeDataFile(outputPath, result.spec);
  return result.spec;
}

export async function createLocalListingPlan(profile: BackendProfile, request: ListingSpecRequest): Promise<MutationPlanResponse> {
  const session = await ensureFreshLocalEbaySession(profile);
  return await new BackendApiClient(profile).post<MutationPlanResponse>("/api/local/ebay/listings/create/plan", {
    session: toLocalSessionContext(session),
    listing: request
  });
}

export async function createLocalListing(profile: BackendProfile, request: ListingSpecRequest): Promise<unknown> {
  const session = await ensureFreshLocalEbaySession(profile);
  return await new BackendApiClient(profile).post("/api/local/ebay/listings/create/apply", {
    session: toLocalSessionContext(session),
    listing: request
  });
}

export async function updateLocalListingPlan(profile: BackendProfile, reference: string, request: ListingPatchRequest): Promise<MutationPlanResponse> {
  const session = await ensureFreshLocalEbaySession(profile);
  return await new BackendApiClient(profile).post<MutationPlanResponse>("/api/local/ebay/listings/update/plan", {
    session: toLocalSessionContext(session),
    reference,
    listing: request
  });
}

export async function updateLocalListing(profile: BackendProfile, reference: string, request: ListingPatchRequest): Promise<unknown> {
  const session = await ensureFreshLocalEbaySession(profile);
  return await new BackendApiClient(profile).post("/api/local/ebay/listings/update/apply", {
    session: toLocalSessionContext(session),
    reference,
    listing: request
  });
}

export async function endLocalListingPlan(profile: BackendProfile, reference: string): Promise<MutationPlanResponse> {
  const session = await ensureFreshLocalEbaySession(profile);
  return await new BackendApiClient(profile).post<MutationPlanResponse>("/api/local/ebay/listings/end/plan", {
    session: toLocalSessionContext(session),
    reference
  });
}

export async function endLocalListing(profile: BackendProfile, reference: string): Promise<unknown> {
  const session = await ensureFreshLocalEbaySession(profile);
  return await new BackendApiClient(profile).post("/api/local/ebay/listings/end/apply", {
    session: toLocalSessionContext(session),
    reference
  });
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
