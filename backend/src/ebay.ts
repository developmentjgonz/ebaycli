import { RelayError } from "./responses";
import type { EbayEnvironment, Env, LocalEbaySession } from "./types";

const DEFAULT_SCOPES = [
  "https://api.ebay.com/oauth/api_scope",
  "https://api.ebay.com/oauth/api_scope/sell.account",
  "https://api.ebay.com/oauth/api_scope/sell.inventory",
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly",
  "https://api.ebay.com/oauth/api_scope/commerce.identity.readonly"
];

export function scopes(env: Env): string {
  return env.EBAY_SCOPES?.trim().split(/\s+/).join(" ") || DEFAULT_SCOPES.join(" ");
}

export function sellerAccess(env: Env) {
  const mode = env.SELLER_ACCESS_MODE ?? "restricted";
  if (mode === "open") return { mode, userIds: null };
  if (mode !== "restricted") {
    throw new RelayError(503, "relay_not_configured", "SELLER_ACCESS_MODE must be 'restricted' or an explicitly configured 'open'.");
  }
  const userIds = new Set(env.ALLOWED_EBAY_USER_IDS?.split(",").map(id => id.trim()).filter(Boolean));
  if (!userIds.size) {
    throw new RelayError(503, "relay_not_configured", "Configure ALLOWED_EBAY_USER_IDS with the deployment owner's immutable eBay user ID before enabling OAuth.");
  }
  return { mode, userIds };
}

export function requireAllowedSeller(env: Env, userId: unknown): void {
  const access = sellerAccess(env);
  // Usernames can change. Never use one, a caller-supplied ID, or the first login to establish ownership.
  if (typeof userId !== "string" || !userId || (access.userIds !== null && !access.userIds.has(userId))) {
    throw new RelayError(403, "seller_not_allowed", "This eBay account is not allowed to use this relay. Contact the deployment owner.");
  }
}

export function resolveEnvironment(env: Env, environment: string): EbayEnvironment {
  const name = environment.trim().toLowerCase();
  if (name !== "sandbox" && name !== "production") {
    throw new RelayError(400, "unsupported_environment", "The eBay environment must be 'sandbox' or 'production'.");
  }
  const sandbox = name === "sandbox";
  const clientId = sandbox ? env.EBAY_SANDBOX_CLIENT_ID : env.EBAY_PRODUCTION_CLIENT_ID;
  const clientSecret = sandbox ? env.EBAY_SANDBOX_CLIENT_SECRET : env.EBAY_PRODUCTION_CLIENT_SECRET;
  const ruName = sandbox ? env.EBAY_SANDBOX_RUNAME : env.EBAY_PRODUCTION_RUNAME;
  if (!clientId?.trim() || !clientSecret?.trim() || !ruName?.trim()) {
    throw new RelayError(503, "relay_not_configured", `The eBay ${name} client ID, client secret, and RuName must be configured.`);
  }
  return {
    name, clientId, clientSecret, ruName,
    authBaseUrl: sandbox ? "https://auth.sandbox.ebay.com/oauth2" : "https://auth.ebay.com/oauth2",
    apiBaseUrl: sandbox ? "https://api.sandbox.ebay.com" : "https://api.ebay.com",
    identityBaseUrl: sandbox ? "https://apiz.sandbox.ebay.com" : "https://apiz.ebay.com"
  };
}

async function ebayJson(url: string, init: RequestInit): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new RelayError(502, "ebay_api_error", "The eBay service could not be reached. Try again shortly.");
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new RelayError(502, "ebay_api_error", "The eBay service returned an unexpected response.");
  }
  if (!response.ok) {
    const revoked = [400, 401, 403].includes(response.status) &&
      /invalid_grant|invalid_token|token expired|revoked|16110/i.test(JSON.stringify(payload));
    if (revoked) {
      throw new RelayError(401, "local_ebay_auth_revoked", "The eBay authorization has expired or been revoked. Reconnect with `ebay auth login`.");
    }
    // Upstream payloads may contain sensitive values; expose only a generic error.
    throw new RelayError(502, "ebay_api_error", "The eBay service rejected the request. Verify the deployment's eBay configuration and try again.");
  }
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new RelayError(502, "ebay_api_error", "The eBay service returned an unexpected response.");
  }
  return payload as Record<string, unknown>;
}

async function tokenRequest(environment: EbayEnvironment, body: URLSearchParams): Promise<Record<string, unknown>> {
  const credentials = new TextEncoder().encode(`${environment.clientId}:${environment.clientSecret}`);
  return await ebayJson(`${environment.apiBaseUrl}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(Array.from(credentials, byte => String.fromCharCode(byte)).join(""))}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: body.toString()
  });
}

export async function exchangeCode(environment: EbayEnvironment, code: string): Promise<Record<string, unknown>> {
  return await tokenRequest(environment, new URLSearchParams({
    grant_type: "authorization_code", code, redirect_uri: environment.ruName
  }));
}

export async function refreshToken(environment: EbayEnvironment, token: string, scope: string): Promise<Record<string, unknown>> {
  return await tokenRequest(environment, new URLSearchParams({ grant_type: "refresh_token", refresh_token: token, scope }));
}

function string(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function expiration(seconds: unknown, fallback: string | null): string | null {
  return typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0
    ? new Date(Date.now() + seconds * 1000).toISOString()
    : fallback;
}

export async function createSession(
  env: Env,
  environment: EbayEnvironment,
  marketplaceId: string,
  tokens: Record<string, unknown>,
  previous: Partial<LocalEbaySession> = {}
): Promise<LocalEbaySession> {
  const accessToken = string(tokens.access_token);
  const token = string(tokens.refresh_token) || previous.refreshToken;
  if (!accessToken || !token) {
    throw new RelayError(502, "ebay_api_error", "The eBay token response did not include the required tokens.");
  }
  const init = { headers: { Authorization: `Bearer ${accessToken}` } };
  const user = await ebayJson(`${environment.identityBaseUrl}/commerce/identity/v1/user/`, init);
  requireAllowedSeller(env, user.userId);
  const privileges = await ebayJson(`${environment.apiBaseUrl}/sell/account/v1/privilege`, init);
  return {
    environment: environment.name,
    marketplaceId,
    accessToken,
    refreshToken: token,
    accessTokenExpiresAtUtc: expiration(tokens.expires_in, new Date(Date.now() + 7_200_000).toISOString())!,
    refreshTokenExpiresAtUtc: expiration(tokens.refresh_token_expires_in, previous.refreshTokenExpiresAtUtc ?? null),
    scope: string(tokens.scope),
    tokenType: string(tokens.token_type),
    ebayUserId: string(user.userId),
    ebayUsername: string(user.username),
    accountType: string(user.accountType),
    sellerRegistrationCompleted: typeof privileges.sellerRegistrationCompleted === "boolean" ? privileges.sellerRegistrationCompleted : null,
    defaultPaymentPolicyId: previous.defaultPaymentPolicyId ?? null,
    defaultReturnPolicyId: previous.defaultReturnPolicyId ?? null,
    defaultFulfillmentPolicyId: previous.defaultFulfillmentPolicyId ?? null,
    defaultLocationKey: previous.defaultLocationKey ?? null
  };
}
