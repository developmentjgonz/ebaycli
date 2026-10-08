import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import worker from "../src/index.js";
import { completeAuthorization, createEnvironment, EBAY_ACCESS_TOKEN, EBAY_REFRESH_TOKEN, mockEbay, RELAY_ORIGIN, startAuthorization, TEST_NOW } from "./fixtures.js";

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

function callbackRequest(state: string, accept?: string, path = "/oauth/ebay/callback") {
  const url = new URL(path, RELAY_ORIGIN);
  url.searchParams.set("state", state);
  url.searchParams.set("code", "private-ebay-code<&>");
  url.searchParams.set("error_description", "private-provider-detail");
  url.searchParams.set("callbackUrl", "https://untrusted.example/private-callback");
  return new Request(url, accept === undefined ? undefined : { headers: { Accept: accept } });
}

describe("browser OAuth recovery", () => {
  it.each(["unknown", "expired", "processing", "replayed"])("explains recovery for a %s state without reusing it or exposing credentials", async kind => {
    const fetch = mockEbay();
    let state = "private-state-<script>alert(1)</script>";
    if (kind !== "unknown") {
      const started = await startAuthorization(fixture.env);
      state = started.state;
      if (kind === "expired") vi.setSystemTime(TEST_NOW + 600_000);
      if (kind === "processing") {
        fixture.db.sqlite.prepare("UPDATE auth_states SET status = 'processing' WHERE state = ?").run(state);
      }
      if (kind === "replayed") {
        expect((await completeAuthorization(fixture.env, state)).response.status).toBe(302);
      }
    }
    fetch.mockClear();
    const before = fixture.db.sqlite.prepare("SELECT * FROM auth_states ORDER BY state").all();

    const response = await worker.fetch(callbackRequest(state, "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"), fixture.env);
    expect(response.status).toBe(400);
    expect(response.headers.get("Content-Type")).toContain("text/html");
    expect(response.headers.get("Vary")).toBe("Accept");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(response.headers.get("Content-Security-Policy")).toContain("default-src 'none'");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.has("Location")).toBe(false);
    const body = await response.text();
    expect(body).toContain("This sign-in link can’t finish");
    expect(body).toContain("already connected");
    expect(body).toContain("stop the previous login command");
    expect(body).toContain("computer running the CLI");
    expect(body).toContain("10 minutes");
    expect(body).toContain("Refreshing this page cannot complete it");
    expect(body).toContain('href="/"');
    for (const privateValue of [state, "private-state", "private-ebay-code", "private-provider-detail", "untrusted.example", EBAY_ACCESS_TOKEN,
      EBAY_REFRESH_TOKEN, fixture.env.TOKEN_ENCRYPTION_KEY!, fixture.env.EBAY_SANDBOX_CLIENT_SECRET!]) {
      expect(body).not.toContain(privateValue);
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(fixture.db.sqlite.prepare("SELECT * FROM auth_states ORDER BY state").all()).toEqual(before);
  });

  it.each([undefined, "application/json", "application/problem+json", "text/html;q=0, application/json", "*/*"])("preserves JSON callback errors for Accept %s", async accept => {
    const fetch = mockEbay();
    const response = await worker.fetch(callbackRequest("unknown-state", accept), fixture.env);
    expect(response.status).toBe(400);
    expect(response.headers.get("Content-Type")).toContain("application/problem+json");
    expect(response.headers.get("Vary")).toBe("Accept");
    expect(await response.json()).toEqual({
      status: 400,
      title: "local_ebay_authorize_exchange_failed",
      detail: "The local eBay login could not be completed. The state or exchange code is invalid, expired, or already used."
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("offers the same recovery for an unavailable state at the declined browser callback", async () => {
    const fetch = mockEbay();
    const response = await worker.fetch(callbackRequest("private-state", "text/html", "/auth/declined"), fixture.env);
    expect(response.status).toBe(400);
    expect(response.headers.get("Content-Type")).toContain("text/html");
    const body = await response.text();
    expect(body).toContain("This sign-in link can’t finish");
    expect(body).not.toContain("private-state");
    expect(body).not.toContain("private-ebay-code");
    expect(response.headers.has("Location")).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps the CLI exchange endpoint machine-readable even when HTML is accepted", async () => {
    const fetch = mockEbay();
    const response = await worker.fetch(new Request(`${RELAY_ORIGIN}/api/local/ebay/authorize/exchange`, {
      method: "POST",
      headers: { Accept: "text/html", "Content-Type": "application/json" },
      body: JSON.stringify({ state: "private-state", code: "private-exchange-code" })
    }), fixture.env);
    expect(response.status).toBe(400);
    expect(response.headers.get("Content-Type")).toContain("application/problem+json");
    expect(await response.json()).toMatchObject({ status: 400, title: "local_ebay_authorize_exchange_failed" });
    expect(fetch).not.toHaveBeenCalled();
  });
});
