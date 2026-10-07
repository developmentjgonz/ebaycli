import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseListingPatchFile, parseListingSpecFile } from "../src/listing-files.js";

describe("parseListingSpecFile", () => {
  it("normalizes legacy price and local image paths into the normalized listing format", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ebaycli-"));
    try {
      const imagePath = join(dir, "lamp.jpg");
      const listingPath = join(dir, "listing.yaml");

      writeFileSync(imagePath, Buffer.from("fake-image"));
      writeFileSync(
        listingPath,
        [
          "sku: SKU-1",
          "title: Desk lamp",
          "description: Brass desk lamp",
          "categoryId: \"12345\"",
          "condition: USED_EXCELLENT",
          "conditionDescriptors:",
          "  - name: \"40001\"",
          "    values:",
          "      - \"400010\"",
          "price:",
          "  value: \"79.99\"",
          "  currency: USD",
          "availableQuantity: 1",
          "images:",
          "  - ./lamp.jpg"
        ].join("\n")
      );

      const parsed = await parseListingSpecFile(listingPath);
      expect(parsed.priceValue).toBe(79.99);
      expect(parsed.priceCurrency).toBe("USD");
      expect(parsed.conditionDescriptors).toEqual([
        {
          name: "40001",
          values: ["400010"]
        }
      ]);
      expect(parsed.images).toEqual([
        {
          fileName: "lamp.jpg",
          contentType: "image/jpeg",
          base64Content: Buffer.from("fake-image").toString("base64")
        }
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("parseListingPatchFile", () => {
  it("accepts legacy nested price updates", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ebaycli-"));
    try {
      const patchPath = join(dir, "patch.yaml");
      writeFileSync(
        patchPath,
        [
          "price:",
          "  value: \"84.99\"",
          "  currency: USD",
          "availableQuantity: 2"
        ].join("\n")
      );

      const parsed = await parseListingPatchFile(patchPath);
      expect(parsed.priceValue).toBe(84.99);
      expect(parsed.priceCurrency).toBe("USD");
      expect(parsed.availableQuantity).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
