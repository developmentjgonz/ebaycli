import { describe, expect, it } from "vitest";

import { getGuide } from "../src/guide.js";

describe("guide", () => {
  it("describes shared and self-managed auth modes in the overview", () => {
    const guide = getGuide("overview") as {
      model: string;
      authModes: {
        shared: { default: boolean };
        selfManaged: { default: boolean };
      };
    };

    expect(guide.model).toBe("agent-first-local-cli");
    expect(guide.authModes.shared.default).toBe(true);
    expect(guide.authModes.selfManaged.default).toBe(false);
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
});
