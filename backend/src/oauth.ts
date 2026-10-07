import { database, publicBaseUrl } from "./config";
import { decryptText, encryptText, hashHex, importTokenKey, randomCode } from "./crypto";
import { createSession, exchangeCode, refreshToken, requireAllowedSeller, resolveEnvironment, scopes, sellerAccess } from "./ebay";
import { json, optionalString, readObject, redirect, RelayError, requiredString } from "./responses";
import type { AuthState, Env, LocalEbaySession } from "./types";

const START_FAILED = "local_ebay_authorize_start_failed";
const EXCHANGE_FAILED = "local_ebay_authorize_exchange_failed";
const REFRESH_FAILED = "local_ebay_refresh_failed";

async function authKey(env: Env): Promise<CryptoKey> {
  database(env);
  publicBaseUrl(env);
  sellerAccess(env);
  return await importTokenKey(env.TOKEN_ENCRYPTION_KEY);
}

export function normalizeCallbackUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new RelayError(400, START_FAILED, "The local eBay callback URL is invalid.");
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") ||
      (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") ||
      url.username || url.password || url.hash) {
    throw new RelayError(400, START_FAILED, "The callback URL must use http or https on localhost or 127.0.0.1, without credentials or a fragment.");
  }
  return url.toString();
}

function marketplace(value: unknown, title: string): string {
  return optionalString(value, "marketplaceId", title)?.trim() || "EBAY_US";
}

function failedExchange(): RelayError {
  return new RelayError(400, EXCHANGE_FAILED, "The local eBay login could not be completed. The state or exchange code is invalid, expired, or already used.");
}

async function removeClaimedState(db: D1Database, state: string): Promise<void> {
  try {
    await db.prepare("DELETE FROM auth_states WHERE state = ? AND status IN ('processing', 'complete')").bind(state).run();
  } catch {
    // A transient database failure must not strand the waiting CLI. Expiry and scheduled cleanup remain the fallback.
  }
}

export async function startAuthorization(request: Request, env: Env): Promise<Response> {
  const input = await readObject(request);
  const environmentName = requiredString(input.environment, "environment", START_FAILED, 20);
  const callbackUrl = normalizeCallbackUrl(requiredString(input.callbackUrl, "callbackUrl", START_FAILED, 512));
  const marketplaceId = marketplace(input.marketplaceId, START_FAILED);
  await authKey(env);
  const environment = resolveEnvironment(env, environmentName);
  const state = randomCode();
  const now = Date.now();
  const expiresAt = now + 10 * 60_000;
  await database(env).prepare(`
    INSERT INTO auth_states (state, environment, marketplace_id, callback_url, status, created_at, expires_at)
    VALUES (?, ?, ?, ?, 'pending', ?, ?)
  `).bind(state, environment.name, marketplaceId, callbackUrl, now, expiresAt).run();

  const authorizeUrl = new URL(`${environment.authBaseUrl}/authorize`);
  authorizeUrl.search = new URLSearchParams({
    client_id: environment.clientId,
    response_type: "code",
    redirect_uri: environment.ruName,
    scope: scopes(env),
    state
  }).toString();
  return json({
    authorizeUrl: authorizeUrl.toString(), state, environment: environment.name,
    marketplaceId, expiresAtUtc: new Date(expiresAt).toISOString()
  });
}

export async function completeAuthorization(request: Request, env: Env, forceDenied = false): Promise<Response> {
  const url = new URL(request.url);
  const state = requiredString(url.searchParams.get("state"), "state", EXCHANGE_FAILED, 128);
  const key = await authKey(env);
  const db = database(env);
  const denied = forceDenied || url.searchParams.has("error");
  const code = denied ? null : requiredString(url.searchParams.get("code"), "code", EXCHANGE_FAILED);

  // Claim the state before contacting eBay so repeated/concurrent callbacks cannot exchange twice.
  const pending = await db.prepare(`
    UPDATE auth_states SET status = 'processing'
    WHERE state = ? AND status = 'pending' AND expires_at > ?
    RETURNING *
  `).bind(state, Date.now()).first<AuthState>();
  if (!pending) throw failedExchange();

  if (denied) {
    await removeClaimedState(db, state);
    const callback = new URL(normalizeCallbackUrl(pending.callback_url));
    callback.searchParams.set("state", state);
    callback.searchParams.set("error", "access_denied");
    callback.searchParams.set("error_description", "The eBay consent flow was declined or canceled.");
    return redirect(callback.toString());
  }

  try {
    const environment = resolveEnvironment(env, pending.environment);
    const tokens = await exchangeCode(environment, code!);
    const session = await createSession(env, environment, pending.marketplace_id, tokens);
    const exchange = randomCode();
    const exchangeHash = await hashHex(exchange);
    const sessionCipher = await encryptText(JSON.stringify(session), key, state);
    const now = Date.now();
    const completed = await db.prepare(`
      UPDATE auth_states SET status = 'complete', exchange_code_hash = ?, session_cipher = ?, expires_at = ?
      WHERE state = ? AND status = 'processing' AND expires_at > ?
      RETURNING state
    `).bind(exchangeHash, sessionCipher, now + 5 * 60_000, state, now).first<{ state: string }>();
    if (!completed) throw failedExchange();

    const callback = new URL(normalizeCallbackUrl(pending.callback_url));
    callback.searchParams.set("state", state);
    callback.searchParams.set("code", exchange);
    return redirect(callback.toString());
  } catch (error) {
    await removeClaimedState(db, state);
    const callback = new URL(normalizeCallbackUrl(pending.callback_url));
    callback.searchParams.set("state", state);
    const denied = error instanceof RelayError && error.title === "seller_not_allowed";
    callback.searchParams.set("error", denied ? "seller_not_allowed" : "authorization_failed");
    callback.searchParams.set("error_description", denied
      ? "This eBay account is not allowed to use this relay. Contact the deployment owner."
      : "The eBay authorization could not be completed. Retry `ebay auth login` and verify the relay configuration.");
    return redirect(callback.toString());
  }
}

export async function exchangeAuthorization(request: Request, env: Env): Promise<Response> {
  const input = await readObject(request);
  const state = requiredString(input.state, "state", EXCHANGE_FAILED, 128);
  const code = requiredString(input.code, "code", EXCHANGE_FAILED, 256);
  const key = await authKey(env);
  const hash = await hashHex(code);
  // D1 executes this single SQLite statement atomically: only one caller can receive the row.
  const completed = await database(env).prepare(`
    DELETE FROM auth_states
    WHERE state = ? AND exchange_code_hash = ? AND status = 'complete' AND expires_at > ?
    RETURNING *
  `).bind(state, hash, Date.now()).first<AuthState>();
  if (!completed?.session_cipher) throw failedExchange();

  try {
    const session: LocalEbaySession = JSON.parse(await decryptText(completed.session_cipher, key, state));
    requireAllowedSeller(env, session.ebayUserId);
    return json(session);
  } catch (error) {
    if (error instanceof RelayError) throw error;
    throw new RelayError(503, "relay_token_unavailable", "The temporary seller session could not be decrypted. Start a new login and verify the deployment's encryption key.");
  }
}

export async function refreshAuthorization(request: Request, env: Env): Promise<Response> {
  const input = await readObject(request);
  const environmentName = requiredString(input.environment, "environment", REFRESH_FAILED, 20);
  const token = requiredString(input.refreshToken, "refreshToken", REFRESH_FAILED);
  const marketplaceId = marketplace(input.marketplaceId, REFRESH_FAILED);
  const previous: Partial<LocalEbaySession> = { refreshToken: token };
  for (const field of ["defaultPaymentPolicyId", "defaultReturnPolicyId", "defaultFulfillmentPolicyId", "defaultLocationKey"] as const) {
    previous[field] = optionalString(input[field], field, REFRESH_FAILED);
  }
  const expiry = optionalString(input.refreshTokenExpiresAtUtc, "refreshTokenExpiresAtUtc", REFRESH_FAILED);
  if (expiry) {
    if (!Number.isFinite(Date.parse(expiry))) {
      throw new RelayError(400, REFRESH_FAILED, "A valid refresh-token expiry timestamp is required.");
    }
    previous.refreshTokenExpiresAtUtc = expiry;
  }
  await authKey(env);
  const environment = resolveEnvironment(env, environmentName);
  const tokens = await refreshToken(environment, token, scopes(env));
  return json(await createSession(env, environment, marketplaceId, tokens, previous));
}

export async function cleanupExpiredStates(env: Env, now = Date.now()): Promise<number> {
  const result = await database(env).prepare("DELETE FROM auth_states WHERE expires_at <= ?").bind(now).run();
  return result.meta.changes;
}

export async function readiness(env: Env): Promise<Response> {
  await authKey(env);
  const configuredEnvironments = (["sandbox", "production"] as const).filter(name => {
    try { resolveEnvironment(env, name); return true; } catch { return false; }
  });
  if (!configuredEnvironments.length) {
    throw new RelayError(503, "relay_not_configured", "Configure a complete sandbox or production eBay keyset before starting OAuth.");
  }
  try {
    await database(env).prepare("SELECT state FROM auth_states LIMIT 1").first();
  } catch {
    throw new RelayError(503, "relay_not_ready", "The authorization database is unavailable or its migration has not been applied.");
  }
  return json({ status: "ready", utc: new Date().toISOString(), configuredEnvironments, sellerAccessMode: sellerAccess(env).mode });
}
