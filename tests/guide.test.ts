import { describe, expect, it } from "vitest";

import { getGuide } from "../src/guide.js";

describe("guide", () => {
  it("returns machine-readable listing spec guidance", () => {
    const guide = getGuide("listing-spec") as {
      format: string;
      requiredFields: string[];
      example: { sku: string; title: string };
    };

    expect(guide.format).toBe("YAML or JSON");
    expect(guide.requiredFields).toContain("sku");
    expect(guide.example.sku).toBe("GENGAR-38-PLUSH-001");
  });
});
