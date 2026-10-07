import { readFileSync } from "node:fs";
import { URL as NodeURL } from "node:url";

import { vi } from "vitest";

import worker from "../src/index.js";
import type { Env } from "../src/types.js";
import { createTestDatabase } from "./d1.js";

export const TEST_NOW = Date.parse("2026-10-07T02:00:00.000Z");
export const RELAY_ORIGIN = "https://relay.example.test";
export const TOKEN_KEY = Buffer.alloc(32, 7).toString("base64");
export const EBAY_ACCESS_TOKEN = "fake-ebay-access-token";
export const EBAY_REFRESH_TOKEN = "fake-ebay-refresh-token";

export function createEnvironment(overrides: Partial<Env> = {}) {
  const db = createTestDatabase(readFileSync(new NodeURL("../migrations/0001_auth.sql", import.meta.url), "utf8"));
  const env: Env = {
    AUTH_DB: db.binding,
    PUBLIC_BASE_URL: RELAY_ORIGIN,
    TOKEN_ENCRYPTION_KEY: TOKEN_KEY,
    EBAY_SANDBOX_CLIENT_ID: "sandbox-client",
    EBAY_SANDBOX_CLIENT_SECRET: "sandbox-secret",
    EBAY_SANDBOX_RUNAME: "sandbox-runame",
    EBAY_PRODUCTION_CLIENT_ID: "production-client",
    EBAY_PRODUCTION_CLIENT_SECRET: "production-secret",
    EBAY_PRODUCTION_RUNAME: "production-runame",
    EBAY_NOTIFICATION_VERIFICATION_TOKEN: "test-notification-verification-token",
    ALLOWED_EBAY_USER_IDS: "seller-123",
    LEGAL_COMPANY_NAME: "Test Company",
    LEGAL_CONTACT_EMAIL: "privacy@example.test",
    LEGAL_WEBSITE_URL: "https://example.test",
    LEGAL_EFFECTIVE_DATE: "2026-10-07",
    ...overrides
  };
  return { env, db };
}

export function send(env: Env, path: string, body?: unknown, method = body === undefined ? "GET" : "POST") {
  return worker.fetch(new Request(`${RELAY_ORIGIN}${path}`, {
    method,
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  }), env);
}

export function mockEbay(options: { token?: Record<string, unknown>; tokenStatus?: number; user?: Record<string, unknown> } = {}) {
  const token = options.token ?? {
    access_token: EBAY_ACCESS_TOKEN,
    refresh_token: EBAY_REFRESH_TOKEN,
    expires_in: 7200,
    refresh_token_expires_in: 86400,
    scope: "https://api.ebay.com/oauth/api_scope",
    token_type: "Bearer"
  };
  const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname === "/identity/v1/oauth2/token") {
      return new Response(JSON.stringify(token), {
        status: options.tokenStatus ?? 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (url.pathname.replace(/\/$/, "") === "/commerce/identity/v1/user") {
      return Response.json(options.user ?? { userId: "seller-123", username: "test-seller", accountType: "BUSINESS" });
    }
    if (url.pathname === "/sell/account/v1/privilege") {
      return Response.json({ sellerRegistrationCompleted: true });
    }
    throw new Error(`Unexpected external request: ${url.origin}${url.pathname}`);
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

export interface StartContract {
  authorizeUrl: string;
  state: string;
  environment: string;
  marketplaceId: string;
  expiresAtUtc: string;
}

export async function startAuthorization(env: Env, callbackUrl = "http://127.0.0.1:8765/callback", environment = "sandbox") {
  const response = await send(env, "/api/local/ebay/authorize/start", { environment, callbackUrl, marketplaceId: "EBAY_US" });
  if (response.status !== 200) throw new Error(`Start returned ${response.status}: ${await response.text()}`);
  return response.json() as Promise<StartContract>;
}

export async function completeAuthorization(env: Env, state: string) {
  const response = await send(env, `/oauth/ebay/callback?state=${encodeURIComponent(state)}&code=opaque-ebay-code`);
  return { response, redirect: response.headers.get("Location") ? new URL(response.headers.get("Location")!) : undefined };
}
