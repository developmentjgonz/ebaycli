import { createHash } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import worker from "../src/index.js";
import { createEnvironment, RELAY_ORIGIN, send, TEST_NOW } from "./fixtures.js";

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

describe("public relay surfaces", () => {
  it("separates liveness from configured readiness", async () => {
    const health = await send(fixture.env, "/health");
    const ready = await send(fixture.env, "/ready");
    expect(health.status).toBe(200);
    expect(ready.status).toBe(200);
    expect(await health.json()).toMatchObject({ status: "ok" });
    expect(await ready.json()).toMatchObject({ status: "ready" });

    delete fixture.env.TOKEN_ENCRYPTION_KEY;
    expect((await send(fixture.env, "/health")).status).toBe(200);
    expect((await send(fixture.env, "/ready")).status).toBe(503);
  });

  it("does not report ready when the auth table is missing", async () => {
    fixture.db.sqlite.exec("DROP TABLE auth_states");
    const response = await send(fixture.env, "/ready");
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ status: 503, title: "relay_not_ready" });
  });

  it.each([
    ["/", "ebaycli relay"],
    ["/privacy", "Privacy Policy"],
    ["/privacy-policy", "Privacy Policy"],
    ["/auth/success", "Authorization complete"],
    ["/auth/declined", "Authorization declined"]
  ])("serves %s publicly as HTML", async (path, content) => {
    const response = await send(fixture.env, path);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/html");
    expect(await response.text()).toContain(content);
  });

  it("uses configured legal information and escapes it before rendering HTML", async () => {
    fixture.env.LEGAL_COMPANY_NAME = "Test <script>alert(1)</script> Company";
    const response = await send(fixture.env, "/privacy");
    const body = await response.text();
    expect(body).toContain("privacy@example.test");
    expect(body).toContain("2026-10-07");
    expect(body).toContain("&lt;script&gt;");
    expect(body).not.toContain("<script>alert(1)</script>");
  });

  it("binds setup instructions to the configured origin and keeps credentials off the page", async () => {
    const response = await worker.fetch(new Request("https://untrusted-host.example/"), fixture.env);
    const body = await response.text();
    expect(body).toContain(`data-relay-origin="${RELAY_ORIGIN}"`);
    expect(body).toContain(`config set --backend-url ${RELAY_ORIGIN} --json`);
    expect(body).not.toContain("untrusted-host.example");
    for (const secret of [fixture.env.TOKEN_ENCRYPTION_KEY, fixture.env.EBAY_PRODUCTION_CLIENT_SECRET,
      fixture.env.EBAY_SANDBOX_CLIENT_SECRET, fixture.env.EBAY_NOTIFICATION_VERIFICATION_TOKEN]) {
      expect(body).not.toContain(secret);
    }
    expect(body).toContain("Other seller onboarding is not available");
    expect(body).toContain("does not have a connected-store dashboard");
  });

  it("restricts setup-page scripts and styles to a fresh matching nonce", async () => {
    const first = await send(fixture.env, "/");
    const second = await send(fixture.env, "/");
    const body = await first.text();
    const nonce = body.match(/<script nonce="([a-f0-9]{32})">/)?.[1];
    expect(nonce).toBeDefined();
    expect(body).toContain(`<style nonce="${nonce}">`);
    expect(first.headers.get("Content-Security-Policy")).toContain(`script-src 'nonce-${nonce}'`);
    expect(first.headers.get("Content-Security-Policy")).toContain("connect-src 'self'");
    expect(first.headers.get("Content-Security-Policy")).not.toContain("unsafe-inline");
    expect(second.headers.get("Content-Security-Policy")).not.toBe(first.headers.get("Content-Security-Policy"));
  });

  it("still serves setup recovery instructions when the public origin is missing or invalid", async () => {
    delete fixture.env.PUBLIC_BASE_URL;
    const response = await send(fixture.env, "/");
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("Set PUBLIC_BASE_URL");
    expect(body).toContain("https://YOUR-RELAY.example");
    fixture.env.PUBLIC_BASE_URL = 'https://invalid.example/<script>alert(1)</script>';
    const invalid = await send(fixture.env, "/");
    expect(await invalid.text()).not.toContain("alert(1)");
  });

  it("does not expose OAuth query values or obsolete manual-paste instructions on landing pages", async () => {
    const response = await send(fixture.env, "/auth/success?code=private-auth-code&state=private-state");
    const body = await response.text();
    expect(body).toContain("Authorization complete");
    expect(body).not.toContain("private-auth-code");
    expect(body).not.toContain("private-state");
    expect(body).not.toContain("manual paste");
  });

  it("keeps the declined landing page public without a state or configured OAuth credentials", async () => {
    delete fixture.env.TOKEN_ENCRYPTION_KEY;
    const fetch = vi.fn(() => { throw new Error("A static declined page must not call eBay."); });
    vi.stubGlobal("fetch", fetch);
    const response = await send(fixture.env, "/auth/declined?code=private-auth-code&error_description=private-provider-detail");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/html");
    expect(response.headers.has("Location")).toBe(false);
    const body = await response.text();
    expect(body).toContain("Authorization declined");
    expect(body).not.toContain("private-auth-code");
    expect(body).not.toContain("private-provider-detail");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("publishes discovery metadata with the supported relay endpoints", async () => {
    const response = await send(fixture.env, "/llms.txt");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/plain");
    const body = await response.text();
    expect(body).toContain("ebaycli");
    expect(body).toContain("/api/local/ebay/authorize/start");
    expect(body).toContain("/api/local/ebay/authorize/exchange");
    expect(body).toContain("/api/local/ebay/refresh");
  });

  it("returns JSON problems for unsupported routes and methods", async () => {
    for (const [path, method, status, title] of [
      ["/not-a-route", "GET", 404, "route_not_found"],
      ["/api/local/ebay/authorize/start", "GET", 405, "method_not_allowed"],
      ["/health", "POST", 405, "method_not_allowed"]
    ] as const) {
      const response = await send(fixture.env, path, undefined, method);
      expect(response.status).toBe(status);
      expect(response.headers.get("Content-Type")).toContain("application/problem+json");
      expect(await response.json()).toMatchObject({ status, title, detail: expect.any(String) });
    }
  });

  it("cleans expired pending and completed states while preserving unexpired logins", async () => {
    const insert = fixture.db.sqlite.prepare(`INSERT INTO auth_states
      (state, environment, marketplace_id, callback_url, status, created_at, expires_at)
      VALUES (?, 'sandbox', 'EBAY_US', 'http://127.0.0.1:8765/callback', ?, ?, ?)`);
    insert.run("expired-pending", "pending", TEST_NOW - 600_000, TEST_NOW - 1);
    insert.run("expired-complete", "complete", TEST_NOW - 600_000, TEST_NOW - 1);
    insert.run("active-pending", "pending", TEST_NOW, TEST_NOW + 600_000);
    const tasks: Promise<unknown>[] = [];
    const ctx = { waitUntil: (task: Promise<unknown>) => tasks.push(task) } as unknown as ExecutionContext;
    await worker.scheduled({ scheduledTime: TEST_NOW } as ScheduledController, fixture.env, ctx);
    await Promise.all(tasks);
    expect(fixture.db.sqlite.prepare("SELECT state FROM auth_states ORDER BY state").all()).toEqual([
      { state: "active-pending" }
    ]);
  });
});

describe("eBay notification verification", () => {
  it.each([
    "/notifications/ebay/marketplace-account-deletion",
    "/notifications/ebay/authorization-revocation"
  ])("returns the prescribed SHA-256 challenge for %s", async (path) => {
    const response = await send(fixture.env, `${path}?challenge_code=test-challenge`);
    expect(response.status).toBe(200);
    const expected = createHash("sha256")
      .update(`test-challenge${fixture.env.EBAY_NOTIFICATION_VERIFICATION_TOKEN}${RELAY_ORIGIN}${path}`)
      .digest("hex");
    expect(await response.json()).toEqual({ challengeResponse: expected });
  });

  it("uses the configured public URL instead of untrusted request or forwarded hosts", async () => {
    const path = "/notifications/ebay/marketplace-account-deletion";
    const response = await worker.fetch(new Request(`https://attacker.example${path}?challenge_code=challenge`, {
      headers: { "X-Forwarded-Host": "other.example", "X-Forwarded-Proto": "http" }
    }), fixture.env);
    const expected = createHash("sha256")
      .update(`challenge${fixture.env.EBAY_NOTIFICATION_VERIFICATION_TOKEN}${RELAY_ORIGIN}${path}`)
      .digest("hex");
    expect(await response.json()).toEqual({ challengeResponse: expected });
  });

  it("rejects a challenge without its code or configured verification token", async () => {
    const path = "/notifications/ebay/marketplace-account-deletion";
    expect((await send(fixture.env, path)).status).toBe(400);
    delete fixture.env.EBAY_NOTIFICATION_VERIFICATION_TOKEN;
    const response = await send(fixture.env, `${path}?challenge_code=challenge`);
    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(response.headers.get("Content-Type")).toContain("application/problem+json");
    expect(await response.json()).toMatchObject({ status: response.status, title: expect.any(String), detail: expect.any(String) });
  });

  it.each([
    "/notifications/ebay/marketplace-account-deletion",
    "/notifications/ebay/authorization-revocation"
  ])("acknowledges POST %s without persisting seller payloads", async (path) => {
    const fetch = vi.fn(() => { throw new Error("Notification acknowledgement must not call eBay."); });
    vi.stubGlobal("fetch", fetch);
    const response = await send(fixture.env, path, {
      notificationId: "notification-1", metadata: { topic: "AUTHORIZATION_REVOCATION" }, data: { username: "test-seller" }
    });
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(fetch).not.toHaveBeenCalled();
    expect(fixture.db.sqlite.prepare("SELECT COUNT(*) AS total FROM auth_states").get()?.total).toBe(0);
  });
});
