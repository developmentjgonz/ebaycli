import { describe, expect, it } from "vitest";

import { createCli } from "../src/cli.js";

describe("CLI shape", () => {
  it("registers the public top-level commands for the local-session product", () => {
    const cli = createCli();
    const commandNames = cli.commands.map((command) => command.name());
    expect(commandNames).toEqual(["guide", "config", "auth", "setup", "listings"]);
  });

  it("exposes the dual-mode auth config surface", () => {
    const cli = createCli();
    const config = cli.commands.find((command) => command.name() === "config");
    expect(config).toBeDefined();
    expect(config?.commands.map((command) => command.name())).toEqual(["set", "auth", "status"]);
  });
});
