import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { buildConfigStatusForOutput, createCli, redactProfileForOutput, runCli } from "../src/cli.js";
import * as oauth from "../src/oauth.js";
import { loadProfiles, upsertProfile } from "../src/profile-config.js";

const originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
const originalExitCode = process.exitCode;

afterEach(() => {
  if (originalXdgConfigHome === undefined) {
    delete process.env.XDG_CONFIG_HOME;
  } else {
    process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
  }
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
});

describe("CLI shape", () => {
  it("registers the public top-level commands for the local-session product", () => {
    const cli = createCli();
    const commandNames = cli.commands.map((command) => command.name());
    expect(commandNames).toEqual(["guide", "llms", "status", "config", "auth", "setup", "listings"]);
    expect(cli.options.some((option) => option.long === "--version")).toBe(true);
  });

  it("exposes the relay-only config surface", () => {
    const cli = createCli();
    const config = cli.commands.find((command) => command.name() === "config");
    expect(config).toBeDefined();
    expect(config?.commands.map((command) => command.name())).toEqual(["set", "status"]);
  });

  it("redacts stored session tokens in profile output", () => {
    const redacted = redactProfileForOutput({
      name: "default",
      ebaySession: {
        environment: "production",
        marketplaceId: "EBAY_US",
        accessToken: "access-token",
        refreshToken: "refresh-token",
        accessTokenExpiresAtUtc: "2099-01-01T00:00:00Z"
      },
      outputFormat: "json"
    });

    expect(redacted.ebaySession?.accessToken).toBe("***redacted***");
    expect(redacted.ebaySession?.refreshToken).toBe("***redacted***");
  });

  it("redacts config set output while preserving the existing profile file and session", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ebaycli-cli-config-"));
    process.env.XDG_CONFIG_HOME = dir;
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const session = {
      environment: "sandbox",
      marketplaceId: "EBAY_US",
      accessToken: "secret-config-access-token",
      refreshToken: "secret-config-refresh-token",
      accessTokenExpiresAtUtc: "2099-01-01T00:00:00Z",
      defaultLocationKey: "warehouse-a"
    };

    try {
      upsertProfile({ name: "existing", backendBaseUrl: "https://old.example.test", ebaySession: session });
      await runCli([
        "node", "ebay", "--profile", "existing", "config", "set",
        "--backend-url", "https://new.example.test", "--json"
      ]);

      const output = stdout.mock.calls.map((call) => String(call[0])).join("");
      expect(JSON.parse(output)).toMatchObject({
        name: "existing",
        backendBaseUrl: "https://new.example.test",
        ebaySession: { accessToken: "***redacted***", refreshToken: "***redacted***" }
      });
      expect(output).not.toContain(session.accessToken);
      expect(output).not.toContain(session.refreshToken);

      const stored = JSON.parse(readFileSync(join(dir, "ebaycli", "backend-profiles.json"), "utf8"));
      expect(stored.profiles).toHaveLength(1);
      expect(stored.profiles[0]).toMatchObject({
        name: "existing",
        backendBaseUrl: "https://new.example.test",
        ebaySession: session
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects unsafe relay configuration and lets a legacy profile be repaired without losing sessions", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ebaycli-cli-transport-"));
    process.env.XDG_CONFIG_HOME = dir;
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const session = {
      environment: "sandbox", marketplaceId: "EBAY_US", accessToken: "stored-access",
      refreshToken: "stored-refresh", accessTokenExpiresAtUtc: "2099-01-01T00:00:00Z"
    };
    try {
      upsertProfile({ name: "legacy", backendBaseUrl: "http://old.example.test", ebaySession: session });
      await runCli(["node", "ebay", "--profile", "legacy", "config", "set", "--backend-url", "http://new.example.test", "--json"]);
      expect(JSON.parse(stderr.mock.calls.map(([value]) => String(value)).join("")).error.code).toBe("CONFIG_ERROR");
      expect(loadProfiles()[0]?.backendBaseUrl).toBe("http://old.example.test");
      await runCli(["node", "ebay", "--profile", "legacy", "config", "set", "--backend-url", "https://new.example.test", "--json"]);
      expect(loadProfiles()[0]).toMatchObject({ backendBaseUrl: "https://new.example.test", ebaySession: session });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("redacts auth login output while storing the returned session for later commands", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ebaycli-cli-login-"));
    process.env.XDG_CONFIG_HOME = dir;
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const session = {
      environment: "sandbox",
      marketplaceId: "EBAY_US",
      accessToken: "secret-login-access-token",
      refreshToken: "secret-login-refresh-token",
      accessTokenExpiresAtUtc: "2099-01-01T00:00:00Z",
      ebayUsername: "test-seller"
    };
    const login = vi.spyOn(oauth, "authenticateWithEbayLocally").mockResolvedValue({
      session,
      authorize: {
        authorizeUrl: "https://auth.sandbox.ebay.com/oauth2/authorize",
        state: "test-state",
        environment: "sandbox",
        marketplaceId: "EBAY_US",
        expiresAtUtc: "2099-01-01T00:00:00Z"
      },
      opened: false,
      callbackUrl: "http://127.0.0.1:8765/callback"
    });

    try {
      upsertProfile({ name: "seller", backendBaseUrl: "https://relay.example.test" });
      await runCli(["node", "ebay", "--profile", "seller", "auth", "login", "--environment", "sandbox", "--no-open", "--json"]);

      const output = stdout.mock.calls.map((call) => String(call[0])).join("");
      expect(JSON.parse(output).connection).toMatchObject({
        ebayUsername: "test-seller",
        accessToken: "***redacted***",
        refreshToken: "***redacted***"
      });
      expect(output).not.toContain(session.accessToken);
      expect(output).not.toContain(session.refreshToken);
      expect(login).toHaveBeenCalledOnce();
      expect(loadProfiles()[0]?.ebaySession).toEqual(session);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("shows first-run readiness and setup commands in config status output", () => {
    const output = buildConfigStatusForOutput({
      name: "default",
      outputFormat: "text"
    });

    expect(output).toEqual(
      expect.objectContaining({
        profile: {
          name: "default",
          outputFormat: "text"
        },
        setup: expect.objectContaining({
          authMode: "unconfigured",
          configured: {
            backendBaseUrl: false,
            ebaySession: false
          },
          readyForLogin: false,
          readyForOperations: false,
          nextCommands: [
            "ebay config set --backend-url https://your-backend.example.com --json",
            "ebay auth login --environment production --json",
            "ebay status --json"
          ]
        })
      })
    );
  });

  it("marks backend-relay profiles ready for login", () => {
    const output = buildConfigStatusForOutput({
      name: "default",
      backendBaseUrl: "https://backend.example.test",
      outputFormat: "text"
    });

    expect(output).toEqual(
      expect.objectContaining({
        setup: expect.objectContaining({
          authMode: "backend-relay",
          configured: {
            backendBaseUrl: true,
            ebaySession: false
          },
          readyForLogin: true,
          readyForOperations: false,
          nextCommands: [
            "ebay auth login --environment production --json",
            "ebay status --json"
          ]
        })
      })
    );
  });

  it("emits a single machine-readable error envelope in JSON mode", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ebaycli-cli-config-"));
    process.env.XDG_CONFIG_HOME = dir;
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    try {
      await runCli(["node", "ebay", "status", "--json"]);
      const output = stderr.mock.calls.map((call) => String(call[0])).join("");
      const parsed = JSON.parse(output) as {
        error: {
          code: string;
          details: {
            issue: string;
            nextCommands: string[];
          };
        };
      };

      expect(process.exitCode).toBe(1);
      expect(parsed.error.code).toBe("CONFIG_ERROR");
      expect(parsed.error.details.issue).toBe("missing_backend_url");
      expect(parsed.error.details.nextCommands).toContain("ebay status --json");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
