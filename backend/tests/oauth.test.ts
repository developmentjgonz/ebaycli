import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import worker from "../src/index.js";
import {
  completeAuthorization,
  createEnvironment,
  EBAY_ACCESS_TOKEN,
  EBAY_REFRESH_TOKEN,
  mockEbay,
  send,
  startAuthorization,
  TEST_NOW
} from "./fixtures.js";

let fixture: ReturnType<typeof createEnvironment>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(TEST_NOW);
  fixture = createEnvironment();
});

afterEach(() => {
  fixture.db.close();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function expectProblem(response: Response, status: number, title: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get("Content-Type")).toContain("application/problem+json");
  const body = await response.json() as { status: number; title: string; detail: string; stack?: unknown };
  expect(body).toMatchObject({ status, title, detail: expect.any(String) });
  expect(body.stack).toBeUndefined();
  return body;
}

describe("CLI-compatible OAuth relay", () => {
  it.each(["sandbox", "production"])("starts an anonymous %s flow with the installed CLI contract", async (environment) => {
    const started = await startAuthorization(fixture.env, "http://127.0.0.1:8765/callback", environment);
    const authorize = new URL(started.authorizeUrl);
    expect(authorize.origin).toBe(environment === "sandbox" ? "https://auth.sandbox.ebay.com" : "https://auth.ebay.com");
    expect(authorize.pathname).toBe("/oauth2/authorize");
    expect(authorize.searchParams.get("client_id")).toBe(`${environment}-client`);
    expect(authorize.searchParams.get("redirect_uri")).toBe(`${environment}-runame`);
    expect(authorize.searchParams.get("response_type")).toBe("code");
    expect(authorize.searchParams.get("state")).toBe(started.state);
    expect(authorize.searchParams.get("scope")).toContain("https://api.ebay.com/oauth/api_scope");
    expect(started).toMatchObject({ environment, marketplaceId: "EBAY_US", state: expect.any(String) });
    expect(started.state.length).toBeGreaterThanOrEqual(32);
    expect(Date.parse(started.expiresAtUtc)).toBe(TEST_NOW + 10 * 60 * 1000);
  });

  it.each(["http://localhost:8765/callback", "https://127.0.0.1:8765/callback"])("allows the loopback callback %s", async (callbackUrl) => {
    const started = await startAuthorization(fixture.env, callbackUrl);
    const stored = fixture.db.sqlite.prepare("SELECT callback_url FROM auth_states WHERE state = ?").get(started.state);
    expect(stored?.callback_url).toBe(callbackUrl);
  });

  it.each([
    "https://external.example/callback",
    "http://localhost.evil.example/callback",
    "http://127.0.0.1.evil.example/callback",
    "http://192.168.1.10/callback",
    "http://[::1]:8765/callback",
    "file:///tmp/callback",
    "javascript:alert(1)",
    "http://user:password@localhost:8765/callback",
    "http://localhost:8765/callback#fragment",
    "relative/callback"
  ])("rejects callbacks outside the loopback allowlist: %s", async (callbackUrl) => {
    await expectProblem(await send(fixture.env, "/api/local/ebay/authorize/start", {
      environment: "sandbox", callbackUrl
    }), 400, "local_ebay_authorize_start_failed");
    expect(fixture.db.sqlite.prepare("SELECT COUNT(*) AS total FROM auth_states").get()?.total).toBe(0);
  });

  it("exchanges a browser callback for encrypted storage and a local one-time code, then returns the CLI session", async () => {
    const fetch = mockEbay();
    const started = await startAuthorization(fixture.env, "http://127.0.0.1:8765/callback?client=cli");
    const { response, redirect } = await completeAuthorization(fixture.env, started.state);
    expect(response.status).toBe(302);
    expect(redirect?.origin).toBe("http://127.0.0.1:8765");
    expect(redirect?.pathname).toBe("/callback");
    expect(redirect?.searchParams.get("client")).toBe("cli");
    expect(redirect?.searchParams.get("state")).toBe(started.state);
    const code = redirect?.searchParams.get("code");
    expect(code).toBeTruthy();
    expect(code).not.toBe("opaque-ebay-code");
    expect(redirect?.href).not.toContain(EBAY_ACCESS_TOKEN);
    expect(redirect?.href).not.toContain(EBAY_REFRESH_TOKEN);

    const stored = fixture.db.sqlite.prepare("SELECT * FROM auth_states WHERE state = ?").get(started.state);
    const serialized = JSON.stringify(stored);
    expect(stored?.status).toBe("complete");
    expect(stored?.session_cipher).toMatch(/^v1\./);
    expect(serialized).not.toContain(EBAY_ACCESS_TOKEN);
    expect(serialized).not.toContain(EBAY_REFRESH_TOKEN);
    expect(serialized).not.toContain(code!);

    const [tokenUrl, init] = fetch.mock.calls[0]!;
    expect(String(tokenUrl)).toBe("https://api.sandbox.ebay.com/identity/v1/oauth2/token");
    const params = new URLSearchParams(String(init?.body));
    expect(params.get("grant_type")).toBe("authorization_code");
    expect(params.get("code")).toBe("opaque-ebay-code");
    expect(params.get("redirect_uri")).toBe("sandbox-runame");
    expect(new Headers(init?.headers).get("Authorization")).toBe(`Basic ${btoa("sandbox-client:sandbox-secret")}`);

    const exchange = await send(fixture.env, "/api/local/ebay/authorize/exchange", { state: started.state, code });
    expect(exchange.status).toBe(200);
    expect(exchange.headers.get("Cache-Control")).toBe("no-store");
    expect(await exchange.json()).toMatchObject({
      environment: "sandbox",
      marketplaceId: "EBAY_US",
      accessToken: EBAY_ACCESS_TOKEN,
      refreshToken: EBAY_REFRESH_TOKEN,
      accessTokenExpiresAtUtc: new Date(TEST_NOW + 7200 * 1000).toISOString(),
      refreshTokenExpiresAtUtc: new Date(TEST_NOW + 86400 * 1000).toISOString(),
      ebayUserId: "seller-123",
      ebayUsername: "test-seller",
      accountType: "BUSINESS",
      sellerRegistrationCompleted: true
    });
    expect(fixture.db.sqlite.prepare("SELECT COUNT(*) AS total FROM auth_states").get()?.total).toBe(0);
    await expectProblem(await send(fixture.env, "/api/local/ebay/authorize/exchange", { state: started.state, code }), 400, "local_ebay_authorize_exchange_failed");
  });

  it("does not consume a valid exchange when presented with the wrong code", async () => {
    mockEbay();
    const started = await startAuthorization(fixture.env);
    const { redirect } = await completeAuthorization(fixture.env, started.state);
    await expectProblem(await send(fixture.env, "/api/local/ebay/authorize/exchange", {
      state: started.state, code: "wrong-code"
    }), 400, "local_ebay_authorize_exchange_failed");
    expect((await send(fixture.env, "/api/local/ebay/authorize/exchange", {
      state: started.state, code: redirect!.searchParams.get("code")
    })).status).toBe(200);
  });

  it("claims an OAuth callback atomically so repeated or concurrent callbacks cannot re-exchange the eBay code", async () => {
    const fetch = mockEbay();
    const started = await startAuthorization(fixture.env);
    const attempts = await Promise.all([
      completeAuthorization(fixture.env, started.state),
      completeAuthorization(fixture.env, started.state)
    ]);
    expect(attempts.map((attempt) => attempt.response.status).sort()).toEqual([302, 400]);
    expect(fetch.mock.calls.filter(([url]) => String(url).includes("/identity/v1/oauth2/token"))).toHaveLength(1);
    await expectProblem((await completeAuthorization(fixture.env, started.state)).response, 400, "local_ebay_authorize_exchange_failed");
  });

  it("consumes an exchange atomically when two clients race for the same local code", async () => {
    mockEbay();
    const started = await startAuthorization(fixture.env);
    const { redirect } = await completeAuthorization(fixture.env, started.state);
    const body = { state: started.state, code: redirect!.searchParams.get("code") };
    const attempts = await Promise.all([
      send(fixture.env, "/api/local/ebay/authorize/exchange", body),
      send(fixture.env, "/api/local/ebay/authorize/exchange", body)
    ]);
    expect(attempts.map((response) => response.status).sort()).toEqual([200, 400]);
  });

  it("rejects an expired pending state before contacting eBay", async () => {
    const fetch = mockEbay();
    const started = await startAuthorization(fixture.env);
    vi.setSystemTime(TEST_NOW + 10 * 60 * 1000);
    await expectProblem((await completeAuthorization(fixture.env, started.state)).response, 400, "local_ebay_authorize_exchange_failed");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects an expired completed exchange code", async () => {
    mockEbay();
    const started = await startAuthorization(fixture.env);
    const { redirect } = await completeAuthorization(fixture.env, started.state);
    vi.setSystemTime(TEST_NOW + 5 * 60 * 1000);
    await expectProblem(await send(fixture.env, "/api/local/ebay/authorize/exchange", {
      state: started.state, code: redirect!.searchParams.get("code")
    }), 400, "local_ebay_authorize_exchange_failed");
  });

  it("returns a reconnectable JSON problem for an unknown browser state", async () => {
    const fetch = mockEbay();
    await expectProblem((await completeAuthorization(fixture.env, "unknown-state")).response, 400, "local_ebay_authorize_exchange_failed");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns a declined consent flow to the waiting loopback CLI without contacting eBay", async () => {
    const fetch = mockEbay();
    const started = await startAuthorization(fixture.env);
    const response = await send(fixture.env, `/oauth/ebay/callback?state=${started.state}&error=access_denied&error_description=Consent%20declined`);
    expect(response.status).toBe(302);
    const redirect = new URL(response.headers.get("Location")!);
    expect(redirect.origin).toBe("http://127.0.0.1:8765");
    expect(redirect.searchParams.get("state")).toBe(started.state);
    expect(redirect.searchParams.get("error")).toBeTruthy();
    expect(redirect.searchParams.has("code")).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(fixture.db.sqlite.prepare("SELECT COUNT(*) AS total FROM auth_states").get()?.total).toBe(0);
  });

  it("returns the separate eBay declined URL to the waiting CLI and ignores any authorization code", async () => {
    const fetch = mockEbay();
    const started = await startAuthorization(fixture.env, "http://127.0.0.1:8765/callback?client=cli");
    const response = await send(fixture.env, `/auth/declined?state=${started.state}&code=ignored-ebay-code`);
    expect(response.status).toBe(302);
    const redirect = new URL(response.headers.get("Location")!);
    expect(redirect.origin).toBe("http://127.0.0.1:8765");
    expect(redirect.pathname).toBe("/callback");
    expect(redirect.searchParams.get("client")).toBe("cli");
    expect(redirect.searchParams.get("state")).toBe(started.state);
    expect(redirect.searchParams.get("error")).toBe("access_denied");
    expect(redirect.searchParams.get("error_description")).toBe("The eBay consent flow was declined or canceled.");
    expect(redirect.searchParams.has("code")).toBe(false);
    expect(redirect.href).not.toContain("ignored-ebay-code");
    expect(fetch).not.toHaveBeenCalled();
    expect(fixture.db.sqlite.prepare("SELECT COUNT(*) AS total FROM auth_states").get()?.total).toBe(0);
  });

  it.each(["unknown", "replayed"])("rejects a %s state at the separate declined URL without redirecting", async (kind) => {
    const fetch = mockEbay();
    let state = "unknown-state";
    if (kind === "replayed") {
      const started = await startAuthorization(fixture.env);
      state = started.state;
      expect((await send(fixture.env, `/auth/declined?state=${state}`)).status).toBe(302);
    }
    const response = await send(fixture.env, `/auth/declined?state=${state}&callbackUrl=https%3A%2F%2Fattacker.example%2Fcallback&code=ignored-ebay-code`);
    await expectProblem(response, 400, "local_ebay_authorize_exchange_failed");
    expect(response.headers.has("Location")).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(fixture.db.sqlite.prepare("SELECT COUNT(*) AS total FROM auth_states").get()?.total).toBe(0);
  });

  it.each([
    ["/auth/declined", "access_denied"],
    ["/oauth/ebay/callback", "authorization_failed"]
  ])("still returns %s to the CLI when claimed-state cleanup fails, leaving expiry cleanup as a fallback", async (path, error) => {
    const fetch = mockEbay({ tokenStatus: 500, token: { error_description: "private-provider-detail" } });
    const started = await startAuthorization(fixture.env);
    const prepare = fixture.env.AUTH_DB.prepare.bind(fixture.env.AUTH_DB);
    const deleteFailure = vi.fn().mockRejectedValue(new Error("private-database-detail"));
    vi.spyOn(fixture.env.AUTH_DB, "prepare").mockImplementation((sql) => {
      const statement = prepare(sql);
      if (sql.startsWith("DELETE FROM auth_states WHERE state = ?")) {
        const bind = statement.bind.bind(statement);
        vi.spyOn(statement, "bind").mockImplementation((...values) => {
          const bound = bind(...values);
          vi.spyOn(bound, "run").mockImplementation(deleteFailure);
          return bound;
        });
      }
      return statement;
    });

    const response = await send(fixture.env, `${path}?state=${started.state}&code=private-ebay-code`);
    expect(response.status).toBe(302);
    const redirect = new URL(response.headers.get("Location")!);
    expect(redirect.origin).toBe("http://127.0.0.1:8765");
    expect(redirect.pathname).toBe("/callback");
    expect(redirect.searchParams.get("state")).toBe(started.state);
    expect(redirect.searchParams.get("error")).toBe(error);
    expect(redirect.searchParams.has("code")).toBe(false);
    for (const value of ["private-ebay-code", "private-provider-detail", "private-database-detail"]) {
      expect(redirect.href).not.toContain(value);
    }
    expect(deleteFailure).toHaveBeenCalledOnce();
    if (path === "/auth/declined") expect(fetch).not.toHaveBeenCalled();
    else expect(fetch).toHaveBeenCalledOnce();
    expect(fixture.db.sqlite.prepare("SELECT * FROM auth_states WHERE state = ?").get(started.state)).toMatchObject({
      status: "processing", session_cipher: null, exchange_code_hash: null,
      expires_at: TEST_NOW + 10 * 60 * 1000
    });
    await expectProblem(await send(fixture.env, "/api/local/ebay/authorize/exchange", {
      state: started.state, code: "private-ebay-code"
    }), 400, "local_ebay_authorize_exchange_failed");

    vi.setSystemTime(TEST_NOW + 10 * 60 * 1000);
    await worker.scheduled({ scheduledTime: Date.now() } as ScheduledController, fixture.env);
    expect(fixture.db.sqlite.prepare("SELECT COUNT(*) AS total FROM auth_states").get()?.total).toBe(0);
  });

  it("preserves seller defaults on refresh when eBay does not issue a replacement refresh token", async () => {
    const fetch = mockEbay({ token: { access_token: "refreshed-access", expires_in: 3600, token_type: "Bearer" } });
    const response = await send(fixture.env, "/api/local/ebay/refresh", {
      environment: "sandbox",
      marketplaceId: "EBAY_GB",
      refreshToken: "existing-refresh",
      refreshTokenExpiresAtUtc: "2027-01-01T00:00:00.000Z",
      defaultPaymentPolicyId: "payment-1",
      defaultReturnPolicyId: "return-1",
      defaultFulfillmentPolicyId: "fulfillment-1",
      defaultLocationKey: "warehouse-a"
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      environment: "sandbox",
      marketplaceId: "EBAY_GB",
      accessToken: "refreshed-access",
      refreshToken: "existing-refresh",
      refreshTokenExpiresAtUtc: "2027-01-01T00:00:00.000Z",
      accessTokenExpiresAtUtc: new Date(TEST_NOW + 3600 * 1000).toISOString(),
      defaultPaymentPolicyId: "payment-1",
      defaultReturnPolicyId: "return-1",
      defaultFulfillmentPolicyId: "fulfillment-1",
      defaultLocationKey: "warehouse-a"
    });
    const params = new URLSearchParams(String(fetch.mock.calls[0]![1]?.body));
    expect(params.get("grant_type")).toBe("refresh_token");
    expect(params.get("refresh_token")).toBe("existing-refresh");
    expect(fixture.db.sqlite.prepare("SELECT COUNT(*) AS total FROM auth_states").get()?.total).toBe(0);
  });

  it("reports revoked authorization in the JSON shape understood by the CLI", async () => {
    mockEbay({ tokenStatus: 400, token: { error: "invalid_grant", error_description: "The refresh grant is revoked." } });
    const problem = await expectProblem(await send(fixture.env, "/api/local/ebay/refresh", {
      environment: "sandbox", refreshToken: "revoked-refresh"
    }), 401, "local_ebay_auth_revoked");
    expect(problem.detail).not.toContain("revoked-refresh");
    expect(problem.detail).not.toContain("sandbox-secret");
  });

  it("clears failed callback state and returns a sanitized failure to the waiting CLI when eBay is unavailable", async () => {
    mockEbay({ tokenStatus: 500, token: { error_description: "secret-provider-detail", access_token: "unexpected-provider-token" } });
    const started = await startAuthorization(fixture.env);
    const { response, redirect } = await completeAuthorization(fixture.env, started.state);
    expect(response.status).toBe(302);
    expect(redirect?.origin).toBe("http://127.0.0.1:8765");
    expect(redirect?.pathname).toBe("/callback");
    expect(redirect?.searchParams.get("state")).toBe(started.state);
    expect(redirect?.searchParams.get("error")).toBe("authorization_failed");
    expect(redirect?.searchParams.has("code")).toBe(false);
    expect(redirect?.href).not.toContain("opaque-ebay-code");
    expect(redirect?.href).not.toContain("secret-provider-detail");
    expect(redirect?.href).not.toContain("unexpected-provider-token");
    expect(fixture.db.sqlite.prepare("SELECT COUNT(*) AS total FROM auth_states").get()?.total).toBe(0);
  });

  it("rejects malformed JSON and invalid request field types with a JSON problem", async () => {
    const malformed = await worker.fetch(new Request("https://relay.example.test/api/local/ebay/authorize/start", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{invalid"
    }), fixture.env);
    await expectProblem(malformed, 400, "invalid_request");
    await expectProblem(await send(fixture.env, "/api/local/ebay/authorize/start", {
      environment: "staging", callbackUrl: "http://127.0.0.1:8765/callback"
    }), 400, "unsupported_environment");
    await expectProblem(await send(fixture.env, "/api/local/ebay/refresh", {
      environment: "sandbox", refreshToken: 123
    }), 400, "local_ebay_refresh_failed");
  });

  it("rejects an oversized chunked body without Content-Length and cancels the stream", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("x".repeat(16_384)));
        controller.enqueue(new TextEncoder().encode("x"));
      },
      cancel
    });
    // Node requires duplex for a streamed request; Workers request types omit it.
    const init = { method: "POST", body: stream, duplex: "half" } as unknown as RequestInit;
    const request = new Request("https://relay.example.test/api/local/ebay/authorize/start", init);
    expect(request.headers.has("Content-Length")).toBe(false);

    await expectProblem(await worker.fetch(request, fixture.env), 413, "request_too_large");
    expect(cancel).toHaveBeenCalledOnce();
    expect(fixture.db.sqlite.prepare("SELECT COUNT(*) AS total FROM auth_states").get()?.total).toBe(0);
  });

  it.each(["TOKEN_ENCRYPTION_KEY", "EBAY_SANDBOX_CLIENT_SECRET", "PUBLIC_BASE_URL"] as const)("fails with a configuration problem when %s is missing", async (field) => {
    delete fixture.env[field];
    const fetch = mockEbay();
    await expectProblem(await send(fixture.env, "/api/local/ebay/authorize/start", {
      environment: "sandbox", callbackUrl: "http://127.0.0.1:8765/callback"
    }), 503, "relay_not_configured");
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["/api/local/ebay/authorize/start", "/api/local/ebay/authorize/exchange", "/api/local/ebay/refresh"])("limits %s before contacting eBay or persisting OAuth state", async (path) => {
    const limit = vi.fn().mockResolvedValue({ success: false });
    const fetch = mockEbay();
    fixture.env.AUTH_RATE_LIMITER = { limit } as unknown as RateLimit;
    const response = await send(fixture.env, path, {
      environment: "sandbox", callbackUrl: "http://127.0.0.1:8765/callback"
    });
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ status: 429, title: expect.any(String), detail: expect.any(String) });
    expect(limit).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(fixture.db.sqlite.prepare("SELECT COUNT(*) AS total FROM auth_states").get()?.total).toBe(0);
  });

  it("returns a JSON problem without session secrets when encrypted transient state is corrupted", async () => {
    mockEbay();
    const started = await startAuthorization(fixture.env);
    const { redirect } = await completeAuthorization(fixture.env, started.state);
    fixture.db.sqlite.prepare("UPDATE auth_states SET session_cipher = ? WHERE state = ?").run("v1.invalid.invalid", started.state);
    const response = await send(fixture.env, "/api/local/ebay/authorize/exchange", {
      state: started.state, code: redirect!.searchParams.get("code")
    });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.headers.get("Content-Type")).toContain("application/problem+json");
    const body = await response.text();
    expect(body).not.toContain(EBAY_ACCESS_TOKEN);
    expect(body).not.toContain(EBAY_REFRESH_TOKEN);
    expect(JSON.parse(body)).toMatchObject({ status: response.status, title: expect.any(String), detail: expect.any(String) });
  });
});

describe("deployment seller access", () => {
  it.each([undefined, "", " , , "])("keeps restricted OAuth inactive without configured user IDs: %s", async (ids) => {
    delete fixture.env.SELLER_ACCESS_MODE;
    fixture.env.ALLOWED_EBAY_USER_IDS = ids;
    const fetch = mockEbay();

    await expectProblem(await send(fixture.env, "/ready"), 503, "relay_not_configured");
    await expectProblem(await send(fixture.env, "/api/local/ebay/authorize/start", {
      environment: "sandbox", callbackUrl: "http://127.0.0.1:8765/callback"
    }), 503, "relay_not_configured");
    await expectProblem(await send(fixture.env, "/api/local/ebay/refresh", {
      environment: "sandbox", refreshToken: "existing-refresh"
    }), 503, "relay_not_configured");
    expect((await send(fixture.env, "/health")).status).toBe(200);
    expect(fetch).not.toHaveBeenCalled();
    expect(fixture.db.sqlite.prepare("SELECT COUNT(*) AS total FROM auth_states").get()?.total).toBe(0);
  });

  it("fails closed for an unrecognized access mode", async () => {
    Object.assign(fixture.env, { SELLER_ACCESS_MODE: "Open" });
    const fetch = mockEbay();
    await expectProblem(await send(fixture.env, "/ready"), 503, "relay_not_configured");
    await expectProblem(await send(fixture.env, "/api/local/ebay/authorize/start", {
      environment: "sandbox", callbackUrl: "http://127.0.0.1:8765/callback"
    }), 503, "relay_not_configured");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reports restricted readiness without exposing the secret allowlist", async () => {
    const response = await send(fixture.env, "/ready");
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(JSON.parse(body)).toMatchObject({ sellerAccessMode: "restricted" });
    expect(body).not.toContain("seller-123");
  });

  it.each([
    { userId: "other-seller", username: "seller-123" },
    { username: "seller-123" },
    { userId: "", username: "seller-123" }
  ])("rejects a callback unless eBay returns an allowed immutable user ID: %j", async (user) => {
    const fetch = mockEbay({ user });
    const started = await startAuthorization(fixture.env);
    const { response, redirect } = await completeAuthorization(fixture.env, started.state);
    expect(response.status).toBe(302);
    expect(redirect?.origin).toBe("http://127.0.0.1:8765");
    expect(redirect?.searchParams.get("state")).toBe(started.state);
    expect(redirect?.searchParams.get("error")).toBe("seller_not_allowed");
    expect(redirect?.searchParams.get("error_description")).toContain("Contact the deployment owner");
    expect(redirect?.searchParams.has("code")).toBe(false);
    for (const secret of [EBAY_ACCESS_TOKEN, EBAY_REFRESH_TOKEN, "other-seller", "seller-123"]) {
      expect(redirect?.href).not.toContain(secret);
    }
    expect(fetch.mock.calls.some(([url]) => String(url).includes("/sell/account/v1/privilege"))).toBe(false);
    expect(fixture.db.sqlite.prepare("SELECT COUNT(*) AS total FROM auth_states").get()?.total).toBe(0);
  });

  it("allows an invited seller from the comma-separated immutable-ID list", async () => {
    fixture.env.ALLOWED_EBAY_USER_IDS = " seller-123, invited-seller , seller-123 ";
    mockEbay({ user: { userId: "invited-seller", username: "renamed-seller" } });
    const started = await startAuthorization(fixture.env);
    const { redirect } = await completeAuthorization(fixture.env, started.state);
    const response = await send(fixture.env, "/api/local/ebay/authorize/exchange", {
      state: started.state, code: redirect?.searchParams.get("code")
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ebayUserId: "invited-seller", ebayUsername: "renamed-seller" });
  });

  it("checks the eBay-resolved account on refresh rather than trusting caller-provided identity", async () => {
    mockEbay({ user: { userId: "other-seller", username: "seller-123" } });
    const response = await send(fixture.env, "/api/local/ebay/refresh", {
      environment: "sandbox", refreshToken: "existing-refresh", ebayUserId: "seller-123"
    });
    await expectProblem(response.clone(), 403, "seller_not_allowed");
    const body = await response.text();
    for (const secret of [EBAY_ACCESS_TOKEN, EBAY_REFRESH_TOKEN, "existing-refresh", "other-seller", "seller-123"]) {
      expect(body).not.toContain(secret);
    }
    expect(fixture.db.sqlite.prepare("SELECT COUNT(*) AS total FROM auth_states").get()?.total).toBe(0);
  });

  it("rejects a completed handoff when its seller was removed from the allowlist", async () => {
    mockEbay();
    const started = await startAuthorization(fixture.env);
    const { redirect } = await completeAuthorization(fixture.env, started.state);
    fixture.env.ALLOWED_EBAY_USER_IDS = "replacement-owner";
    const response = await send(fixture.env, "/api/local/ebay/authorize/exchange", {
      state: started.state, code: redirect?.searchParams.get("code")
    });
    await expectProblem(response.clone(), 403, "seller_not_allowed");
    expect(await response.text()).not.toContain(EBAY_ACCESS_TOKEN);
    expect(fixture.db.sqlite.prepare("SELECT COUNT(*) AS total FROM auth_states").get()?.total).toBe(0);
  });

  it("requires an explicit open mode to authorize sellers without an allowlist", async () => {
    fixture.env.SELLER_ACCESS_MODE = "open";
    delete fixture.env.ALLOWED_EBAY_USER_IDS;
    mockEbay({ user: { userId: "other-seller", username: "test-seller" } });
    expect(await (await send(fixture.env, "/ready")).json()).toMatchObject({ sellerAccessMode: "open" });
    const started = await startAuthorization(fixture.env);
    const { redirect } = await completeAuthorization(fixture.env, started.state);
    const response = await send(fixture.env, "/api/local/ebay/authorize/exchange", {
      state: started.state, code: redirect?.searchParams.get("code")
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ebayUserId: "other-seller" });
  });
});
