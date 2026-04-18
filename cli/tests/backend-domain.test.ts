import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  beginLocalEbayAuthorization,
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
  if (originalXdgConfigHome === undefined) {
    delete process.env.XDG_CONFIG_HOME;
  } else {
    process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
  }
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
  it("builds self-managed authorization locally with the configured eBay app", async () => {
    const profile = upsertBackendProfile({
      name: "self-managed",
      selfManagedApp: {
        environment: "sandbox",
        clientId: "sandbox-client-id",
        clientSecret: "sandbox-client-secret",
        runame: "sandbox-runame",
        privacyPolicyUrl: "https://example.test/privacy",
        acceptedUrl: "https://example.test/auth/success",
        declinedUrl: "https://example.test/auth/declined"
      }
    });

    const result = await beginLocalEbayAuthorization(profile, {
      environment: "sandbox",
      callbackUrl: "https://example.test/auth/success",
      marketplaceId: "EBAY_US"
    });

    expect(result.environment).toBe("sandbox");
    expect(result.authorizeUrl).toContain("https://auth.sandbox.ebay.com/oauth2/authorize");
    expect(result.authorizeUrl).toContain("client_id=sandbox-client-id");
    expect(result.authorizeUrl).toContain("redirect_uri=sandbox-runame");
  });

  it("rejects self-managed authorization when the requested environment does not match the configured app", async () => {
    const profile = upsertBackendProfile({
      name: "self-managed-mismatch",
      selfManagedApp: {
        environment: "production",
        clientId: "prod-client-id",
        clientSecret: "prod-client-secret",
        runame: "prod-runame",
        privacyPolicyUrl: "https://example.test/privacy",
        acceptedUrl: "https://example.test/auth/success",
        declinedUrl: "https://example.test/auth/declined"
      }
    });

    await expect(
      beginLocalEbayAuthorization(profile, {
        environment: "sandbox",
        callbackUrl: "https://example.test/auth/success",
        marketplaceId: "EBAY_US"
      })
    ).rejects.toThrow(/configured for production auth/i);
  });

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
      selfManagedApp: {
        environment: "sandbox",
        clientId: "sandbox-client-id",
        clientSecret: "sandbox-client-secret",
        runame: "sandbox-runame",
        privacyPolicyUrl: "https://example.test/privacy",
        acceptedUrl: "https://example.test/auth/success",
        declinedUrl: "https://example.test/auth/declined"
      },
      ebaySession: expiredSession,
      outputFormat: "json"
    });

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/identity/v1/oauth2/token")) {
        expect(String(init?.body)).toContain("refresh_token=refresh-token-1");
        return new Response(
          JSON.stringify({
            accessToken: "fresh-access-token",
            access_token: "fresh-access-token",
            refreshToken: "refresh-token-2",
            refresh_token: "refresh-token-2",
            accessTokenExpiresAtUtc: "2099-01-01T00:00:00Z",
            expires_in: 7200,
            refresh_token_expires_in: 86400,
            token_type: "User Access Token"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.endsWith("/commerce/identity/v1/user/")) {
        return new Response(
          JSON.stringify({
            userId: "user-123",
            username: "testuser_refresh"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.endsWith("/sell/account/v1/privilege")) {
        expect((init?.headers as Record<string, string> | undefined)?.Authorization).toBe("Bearer fresh-access-token");
        return new Response(
          JSON.stringify({
            sellerRegistrationCompleted: true
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
      expect(status.ebayUsername).toBe("testuser_refresh");
      expect(fetchMock).toHaveBeenCalledTimes(5);

      const persisted = loadBackendProfiles()[0];
      expect(persisted?.ebaySession?.accessToken).toBe("fresh-access-token");
      expect(persisted?.ebaySession?.refreshToken).toBe("refresh-token-2");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("persists local policy defaults and location defaults from direct eBay responses", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ebaycli-config-"));
    process.env.XDG_CONFIG_HOME = dir;

    const profile = upsertBackendProfile({
      name: "default",
      selfManagedApp: {
        environment: "sandbox",
        clientId: "sandbox-client-id",
        clientSecret: "sandbox-client-secret",
        runame: "sandbox-runame",
        privacyPolicyUrl: "https://example.test/privacy",
        acceptedUrl: "https://example.test/auth/success",
        declinedUrl: "https://example.test/auth/declined"
      },
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
      if (url.includes("/sell/account/v1/payment_policy?")) {
        return new Response(
          JSON.stringify({
            paymentPolicies: [{ paymentPolicyId: "payment-123" }]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.includes("/sell/account/v1/return_policy?")) {
        return new Response(
          JSON.stringify({
            returnPolicies: [{ returnPolicyId: "return-123" }]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.includes("/sell/account/v1/fulfillment_policy?")) {
        return new Response(
          JSON.stringify({
            fulfillmentPolicies: [{ fulfillmentPolicyId: "fulfillment-123" }]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.endsWith("/sell/inventory/v1/location/warehouse-a") && init?.method === "POST") {
        return new Response("", { status: 204 });
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

  it("sends listing list filters for sold lookback through Trading", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ebaycli-config-"));
    process.env.XDG_CONFIG_HOME = dir;

    const profile = upsertBackendProfile({
      name: "default",
      selfManagedApp: {
        environment: "production",
        clientId: "prod-client-id",
        clientSecret: "prod-client-secret",
        runame: "prod-runame",
        privacyPolicyUrl: "https://example.test/privacy",
        acceptedUrl: "https://example.test/auth/success",
        declinedUrl: "https://example.test/auth/declined"
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

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe("https://api.ebay.com/ws/api.dll");
      expect((init?.headers as Record<string, string> | undefined)?.["X-EBAY-API-CALL-NAME"]).toBe("GetMyeBaySelling");
      const body = String(init?.body);
      expect(body).toContain("<SoldList>");
      expect(body).toContain("<DurationInDays>30</DurationInDays>");
      expect(body).toContain("<PageNumber>2</PageNumber>");
      expect(body).toContain("<EntriesPerPage>50</EntriesPerPage>");

      return new Response(
        [
          "<GetMyeBaySellingResponse>",
          "  <Ack>Success</Ack>",
          "  <SoldList>",
          "    <PaginationResult><TotalNumberOfEntries>0</TotalNumberOfEntries></PaginationResult>",
          "  </SoldList>",
          "</GetMyeBaySellingResponse>"
        ].join(""),
        { status: 200, headers: { "content-type": "text/xml" } }
      );
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
