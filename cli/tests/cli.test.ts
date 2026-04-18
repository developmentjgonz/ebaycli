import { describe, expect, it } from "vitest";

import { createCli, redactProfileForOutput } from "../src/cli.js";

describe("CLI shape", () => {
  it("registers the public top-level commands for the local-session product", () => {
    const cli = createCli();
    const commandNames = cli.commands.map((command) => command.name());
    expect(commandNames).toEqual(["guide", "llms", "status", "config", "auth", "setup", "listings"]);
  });

  it("exposes the dual-mode auth config surface", () => {
    const cli = createCli();
    const config = cli.commands.find((command) => command.name() === "config");
    expect(config).toBeDefined();
    expect(config?.commands.map((command) => command.name())).toEqual(["set", "auth", "status"]);
  });

  it("redacts both app secrets and stored session tokens in profile output", () => {
    const redacted = redactProfileForOutput({
      name: "default",
      selfManagedApp: {
        environment: "production",
        clientId: "client-id",
        clientSecret: "real-secret",
        runame: "runame"
      },
      ebaySession: {
        environment: "production",
        marketplaceId: "EBAY_US",
        accessToken: "access-token",
        refreshToken: "refresh-token",
        accessTokenExpiresAtUtc: "2099-01-01T00:00:00Z"
      },
      outputFormat: "json"
    });

    expect(redacted.selfManagedApp?.clientSecret).toBe("***redacted***");
    expect(redacted.ebaySession?.accessToken).toBe("***redacted***");
    expect(redacted.ebaySession?.refreshToken).toBe("***redacted***");
  });
});
