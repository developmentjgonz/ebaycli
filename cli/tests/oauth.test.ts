import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { runCli } from "../src/cli.js";
import { beginLocalEbayAuthorization, browserLaunchCommand, normalizeRelayUrl, refreshLocalEbaySession } from "../src/oauth.js";
import { upsertProfile } from "../src/profile-config.js";

const originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
const originalExitCode = process.exitCode;

afterEach(() => {
  if (originalXdgConfigHome === undefined) {
    delete process.env.XDG_CONFIG_HOME;
  } else {
    process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
  }
  process.exitCode = originalExitCode;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function useIsolatedConfigHome(): string {
  const dir = mkdtempSync(join(tmpdir(), "ebaycli-config-"));
  process.env.XDG_CONFIG_HOME = dir;
  return dir;
}

describe("OAuth relay", () => {
  it.each([
    "http://relay.example.test", "http://localhost.attacker.test", "ftp://relay.example.test",
    "https://user:secret@relay.example.test", "https://relay.example.test?token=secret", "https://relay.example.test#fragment"
  ])("does not send seller tokens to an unsafe relay URL: %s", async (backendBaseUrl) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(refreshLocalEbaySession({ name: "seller", backendBaseUrl, outputFormat: "json" }, {
      environment: "sandbox", marketplaceId: "EBAY_US", accessToken: "access-secret",
      refreshToken: "refresh-secret", accessTokenExpiresAtUtc: "2000-01-01T00:00:00Z"
    })).rejects.toMatchObject({ code: "CONFIG_ERROR" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("accepts explicit loopback development and preserves a secure relay path prefix", () => {
    expect(normalizeRelayUrl("http://127.0.0.1:8787/")).toBe("http://127.0.0.1:8787");
    expect(normalizeRelayUrl("http://localhost:8787/")).toBe("http://localhost:8787");
    expect(normalizeRelayUrl("https://relay.example.test/prefix/")).toBe("https://relay.example.test/prefix");
  });

  it("rejects a relay redirect before credentials can be forwarded to another endpoint", async () => {
    const fetch = vi.fn(async (_url, init: RequestInit) => {
      expect(init.redirect).toBe("manual");
      return new Response(null, { status: 307, headers: { Location: "https://other.example.test/refresh" } });
    });
    vi.stubGlobal("fetch", fetch);
    await expect(refreshLocalEbaySession({ name: "seller", backendBaseUrl: "https://relay.example.test", outputFormat: "json" }, {
      environment: "sandbox", marketplaceId: "EBAY_US", accessToken: "access-secret",
      refreshToken: "refresh-secret", accessTokenExpiresAtUtc: "2000-01-01T00:00:00Z"
    })).rejects.toMatchObject({ code: "BACKEND_ERROR", message: expect.stringContaining("redirected") });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("opens Windows consent links without interpreting URL separators as shell commands", () => {
    const url = "https://auth.sandbox.ebay.com/oauth2/authorize?client_id=example&scope=a%20b&state=unicode-✓";
    const launch = browserLaunchCommand(url, "win32");
    expect(launch.command).toBe("powershell.exe");
    expect(launch.args).toContain("-EncodedCommand");
    expect(launch.args.join(" ")).not.toContain(url);
    const script = Buffer.from(launch.args.at(-1)!, "base64").toString("utf16le");
    expect(script).not.toContain("&scope=");
    const encodedUrl = script.match(/FromBase64String\('([A-Za-z0-9+/=]+)'\)/)?.[1];
    expect(encodedUrl).toBeDefined();
    expect(Buffer.from(encodedUrl!, "base64").toString("utf8")).toBe(url);
  });

  it("prints consent instructions before waiting with --no-open and emits one JSON result after a real local callback", async () => {
    const dir = useIsolatedConfigHome();
    const localFetch = globalThis.fetch;
    const authorizeUrl = "https://auth.sandbox.ebay.com/oauth2/authorize?state=local-state";
    let callbackUrl = "";
    let announce: (() => void) | undefined;
    const announced = new Promise<void>((resolve) => { announce = resolve; });
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation((value) => {
      if (String(value).includes(authorizeUrl)) announce?.();
      return true;
    });
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/authorize/start")) {
        callbackUrl = JSON.parse(String(init?.body)).callbackUrl as string;
        return Response.json({
          authorizeUrl, state: "local-state", environment: "sandbox",
          marketplaceId: "EBAY_US", expiresAtUtc: "2099-01-01T00:00:00.000Z"
        });
      }
      if (url.endsWith("/authorize/exchange")) {
        expect(JSON.parse(String(init?.body))).toEqual({ state: "local-state", code: "local-exchange-code" });
        return Response.json({
          environment: "sandbox", marketplaceId: "EBAY_US", accessToken: "local-access-token",
          refreshToken: "local-refresh-token", accessTokenExpiresAtUtc: "2099-01-01T00:00:00.000Z"
        });
      }
      throw new Error(`Unexpected relay request: ${url}`);
    }));
    upsertProfile({ name: "headless", backendBaseUrl: "https://relay.example.test" });
    const login = runCli([
      "node", "ebay", "--profile", "headless", "auth", "login", "--environment", "sandbox",
      "--no-open", "--timeout-seconds", "2", "--json"
    ]);

    try {
      await Promise.race([announced, login.then(() => { throw new Error("Login finished before showing its consent URL."); })]);
      expect(stderr.mock.calls.map(([value]) => String(value)).join("")).toContain("Open this URL in a browser on this machine");
      expect(stdout).not.toHaveBeenCalled();

      const callback = new URL(callbackUrl);
      callback.searchParams.set("state", "local-state");
      callback.searchParams.set("code", "local-exchange-code");
      const response = await localFetch(callback);
      expect(response.status).toBe(200);
      await response.text();
      await login;

      const output = stdout.mock.calls.map(([value]) => String(value)).join("");
      expect(JSON.parse(output)).toMatchObject({
        opened: false,
        connection: { environment: "sandbox", accessToken: "***redacted***", refreshToken: "***redacted***" }
      });
      expect(stdout).toHaveBeenCalledOnce();
      expect(process.exitCode).toBe(originalExitCode);
    } finally {
      await login;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each(["sandbox-seller", "seller's sandbox $(echo unsafe)"])("keeps the selected profile and refresh environment in revoked-auth guidance for %s", async (name) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      title: "local_ebay_auth_revoked",
      detail: "The eBay grant has been revoked.",
      status: 401
    }), { status: 401, headers: { "content-type": "application/problem+json" } })));
    const session = {
      environment: "sandbox",
      marketplaceId: "EBAY_US",
      accessToken: "expired-access",
      refreshToken: "revoked-refresh",
      accessTokenExpiresAtUtc: "2000-01-01T00:00:00.000Z"
    };
    const quotedName = name === "sandbox-seller" ? name
      : process.platform === "win32" ? "'seller''s sandbox $(echo unsafe)'"
        : "'seller'\\''s sandbox $(echo unsafe)'";
    const login = `ebay --profile ${quotedName} auth login --environment sandbox --json`;
    await expect(refreshLocalEbaySession({
      name,
      backendBaseUrl: "https://relay.example.test",
      ebaySession: { ...session, environment: "production" },
      outputFormat: "json"
    }, session)).rejects.toMatchObject({
      code: "AUTH_REVOKED",
      message: `The eBay grant has been revoked. Run \`${login}\` to reconnect.`,
      details: { nextCommands: [login, `ebay --profile ${quotedName} status --json`] }
    });
  });

  it("reads structured problem details from the Worker error response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      title: "relay_not_configured",
      detail: "Configure a complete sandbox eBay keyset before starting OAuth.",
      status: 503
    }), { status: 503, headers: { "content-type": "application/problem+json; charset=utf-8" } })));

    await expect(beginLocalEbayAuthorization({
      name: "example", backendBaseUrl: "https://relay.example.test", outputFormat: "json"
    }, { environment: "sandbox", callbackUrl: "http://127.0.0.1:8765/callback" })).rejects.toMatchObject({
      code: "BACKEND_ERROR",
      message: "Configure a complete sandbox eBay keyset before starting OAuth.",
      details: { title: "relay_not_configured", status: 503 }
    });
  });

  it("uses the backend relay for authorization start with only a backend URL configured", async () => {
    const dir = useIsolatedConfigHome();
    const profile = upsertProfile({
      name: "backend-relay",
      backendBaseUrl: "https://backend.example.test"
    });

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe("https://backend.example.test/api/local/ebay/authorize/start");
      expect(init?.method).toBe("POST");
      expect(init?.headers).toMatchObject({
        "Content-Type": "application/json",
        Accept: "application/json"
      });
      expect(JSON.parse(String(init?.body))).toEqual({
        environment: "sandbox",
        callbackUrl: "http://127.0.0.1:8765/callback",
        marketplaceId: "EBAY_US"
      });

      return new Response(
        JSON.stringify({
          authorizeUrl: "https://auth.sandbox.ebay.com/oauth2/authorize?client_id=backend-client-id",
          state: "backend-state",
          environment: "sandbox",
          marketplaceId: "EBAY_US",
          expiresAtUtc: "2099-01-01T00:00:00Z"
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await beginLocalEbayAuthorization(profile, {
      environment: "sandbox",
      callbackUrl: "http://127.0.0.1:8765/callback",
      marketplaceId: "EBAY_US"
    });

    expect(result.authorizeUrl).toContain("client_id=backend-client-id");
    expect(result.state).toBe("backend-state");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    rmSync(dir, { recursive: true, force: true });
  });

});
