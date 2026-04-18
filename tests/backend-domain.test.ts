import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createOrSetLocalLocation,
  getLocalConnectionStatus,
  listLocalListings,
  parseListingPatchFile,
  parseListingSpecFile,
  syncLocalPolicies
} from "../src/backend-domain.js";
import { loadBackendProfiles, upsertBackendProfile } from "../src/backend-config.js";

const originalXdgConfigHome = process.env.XDG_CONFIG_HOME;

afterEach(() => {
  process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
  vi.unstubAllGlobals();
});

describe("parseListingSpecFile", () => {
  it("normalizes legacy price and local image paths into backend DTO format", async () => {
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

describe("local eBay session flows", () => {
  it("refreshes expired local sessions and persists the new tokens before calling status", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ebaycli-config-"));
    process.env.XDG_CONFIG_HOME = dir;

    const expiredSession = {
      environment: "sandbox",
      marketplaceId: "EBAY_US",
      accessToken: "expired-access-token",
      refreshToken: "refresh-token-1",
      accessTokenExpiresAtUtc: "2000-01-01T00:00:00Z"
    };

    const profile = upsertBackendProfile({
      name: "default",
      backendBaseUrl: "https://example.test",
      ebaySession: expiredSession,
      outputFormat: "json"
    });

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/api/local/ebay/refresh")) {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        expect(body.refreshToken).toBe("refresh-token-1");
        return new Response(
          JSON.stringify({
            environment: "sandbox",
            marketplaceId: "EBAY_US",
            accessToken: "fresh-access-token",
            refreshToken: "refresh-token-2",
            accessTokenExpiresAtUtc: "2099-01-01T00:00:00Z",
            ebayUsername: "testuser_refresh"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.endsWith("/api/local/ebay/status")) {
        const body = JSON.parse(String(init?.body)) as Record<string, { accessToken?: string }>;
        expect(body.session?.accessToken).toBe("fresh-access-token");
        return new Response(
          JSON.stringify({
            storeOwnerSlug: "local",
            connected: true,
            environment: "sandbox",
            marketplaceId: "EBAY_US",
            ebayUsername: "testuser_refresh"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      throw new Error(`Unexpected URL ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    try {
      const status = await getLocalConnectionStatus(profile);
      expect(status.connected).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      const persisted = loadBackendProfiles()[0];
      expect(persisted?.ebaySession?.accessToken).toBe("fresh-access-token");
      expect(persisted?.ebaySession?.refreshToken).toBe("refresh-token-2");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("persists local policy defaults and location defaults returned by the backend", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ebaycli-config-"));
    process.env.XDG_CONFIG_HOME = dir;

    const profile = upsertBackendProfile({
      name: "default",
      backendBaseUrl: "https://example.test",
      ebaySession: {
        environment: "sandbox",
        marketplaceId: "EBAY_US",
        accessToken: "access-token",
        refreshToken: "refresh-token",
        accessTokenExpiresAtUtc: "2099-01-01T00:00:00Z"
      },
      outputFormat: "json"
    });

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/api/local/ebay/setup/policies/sync")) {
        const body = JSON.parse(String(init?.body)) as Record<string, { accessToken?: string }>;
        expect(body.session?.accessToken).toBe("access-token");
        return new Response(
          JSON.stringify({
            defaults: {
              paymentPolicyId: "payment-123",
              returnPolicyId: "return-123",
              fulfillmentPolicyId: "fulfillment-123"
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.endsWith("/api/local/ebay/setup/location")) {
        return new Response(
          JSON.stringify({
            merchantLocationKey: "warehouse-a"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      throw new Error(`Unexpected URL ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    try {
      const policyResult = await syncLocalPolicies(profile, {});
      expect(policyResult.session.defaultPaymentPolicyId).toBe("payment-123");
      expect(policyResult.session.defaultReturnPolicyId).toBe("return-123");
      expect(policyResult.session.defaultFulfillmentPolicyId).toBe("fulfillment-123");

      const locationResult = await createOrSetLocalLocation(profile, { key: "warehouse-a" });
      expect(locationResult.session.defaultLocationKey).toBe("warehouse-a");

      const persisted = loadBackendProfiles()[0];
      expect(persisted?.ebaySession?.defaultPaymentPolicyId).toBe("payment-123");
      expect(persisted?.ebaySession?.defaultReturnPolicyId).toBe("return-123");
      expect(persisted?.ebaySession?.defaultFulfillmentPolicyId).toBe("fulfillment-123");
      expect(persisted?.ebaySession?.defaultLocationKey).toBe("warehouse-a");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("sends listing list filters for status paging and sold lookback", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ebaycli-config-"));
    process.env.XDG_CONFIG_HOME = dir;

    const profile = upsertBackendProfile({
      name: "default",
      backendBaseUrl: "https://example.test",
      ebaySession: {
        environment: "production",
        marketplaceId: "EBAY_US",
        accessToken: "access-token",
        refreshToken: "refresh-token",
        accessTokenExpiresAtUtc: "2099-01-01T00:00:00Z"
      },
      outputFormat: "json"
    });

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body.status).toBe("SOLD");
      expect(body.page).toBe(2);
      expect(body.limit).toBe(50);
      expect(body.days).toBe(30);

      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });

    vi.stubGlobal("fetch", fetchMock);

    try {
      const listings = await listLocalListings(profile, { status: "SOLD", page: 2, limit: 50, days: 30 });
      expect(listings).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
