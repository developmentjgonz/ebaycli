import { describe, expect, it } from "vitest";

import { getGuide } from "../src/guide.js";
import { buildCliLlmsText } from "../src/llms.js";

describe("guide", () => {
  it("describes the backend-relay auth model in the overview", () => {
    const guide = getGuide("overview") as {
      model: string;
      authModel: {
        mode: string;
        setup: string[];
      };
    };

    expect(guide.model).toBe("backend-relay-local-cli");
    expect(guide.authModel.mode).toBe("backend-relay");
    expect(guide.authModel.setup[0]).toContain("ebay config set --backend-url");
    expect(guide.authModel.setup[1]).toContain("ebay auth login --environment production --json");
  });

  it("makes the first connect workflow explicit for agents", () => {
    const guide = getGuide("workflows") as {
      connect: {
        steps: string[];
      };
    };

    expect(guide.connect.steps).toEqual([
      "Run `ebay config set --backend-url https://your-backend.example.com --json` first.",
      "Run `ebay auth login --environment production --json` and finish the eBay consent flow in the browser.",
      "Run `ebay status --json` to verify the local session and seller readiness in one call."
    ]);
  });

  it("returns machine-readable listing spec guidance", () => {
    const guide = getGuide("listing-spec") as {
      format: string;
      requiredFields: string[];
      optionalFields: string[];
      conditionNotes: string[];
      example: { sku: string; title: string };
    };

    expect(guide.format).toBe("YAML or JSON");
    expect(guide.requiredFields).toContain("sku");
    expect(guide.optionalFields).toContain("conditionDescriptors");
    expect(guide.conditionNotes[0]).toContain("conditionDescriptors");
    expect(guide.example.sku).toBe("GENGAR-38-PLUSH-001");
  });

  it("emits CLI llms metadata with runtime discovery guidance", () => {
    const llms = buildCliLlmsText();
    expect(llms).toContain("ebay guide --json");
    expect(llms).toContain("ebay llms");
    expect(llms).toContain("backend-relay local eBay CLI");
  });
});
