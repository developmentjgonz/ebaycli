import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { buildConfigStatusForOutput, createCli, redactProfileForOutput, runCli } from "../src/cli.js";

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
