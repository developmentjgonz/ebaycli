import { describe, expect, it } from "vitest";

import { getGuide } from "../src/guide.js";

describe("guide", () => {
  it("describes the self-managed auth model in the overview", () => {
    const guide = getGuide("overview") as {
      model: string;
      authModel: {
        mode: string;
        setup: string[];
      };
    };

    expect(guide.model).toBe("self-managed-local-cli");
    expect(guide.authModel.mode).toBe("self-managed");
    expect(guide.authModel.setup[0]).toContain("ebay config auth --client-id");
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
