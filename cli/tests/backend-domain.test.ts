import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  beginLocalEbayAuthorization,
  createLocalListingPlan,
  createOrSetLocalLocation,
  getLocalConnectionStatus,
  getLocalListing,
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

function useIsolatedConfigHome(): string {
  const dir = mkdtempSync(join(tmpdir(), "ebaycli-config-"));
  process.env.XDG_CONFIG_HOME = dir;
  return dir;
}

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
    const dir = useIsolatedConfigHome();
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

    rmSync(dir, { recursive: true, force: true });
  });

  it("uses the backend relay for authorization start when a companion backend is configured", async () => {
    const dir = useIsolatedConfigHome();
    const profile = upsertBackendProfile({
      name: "self-managed-relay",
      backendBaseUrl: "https://backend.example.test",
      selfManagedApp: {
        environment: "sandbox",
        clientId: "sandbox-client-id",
        clientSecret: "sandbox-client-secret",
        runame: "sandbox-runame",
        privacyPolicyUrl: "https://backend.example.test/privacy",
        acceptedUrl: "https://backend.example.test/auth/success",
        declinedUrl: "https://backend.example.test/auth/declined"
      }
    });

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe("https://backend.example.test/api/local/ebay/authorize/start");
      expect(init?.method).toBe("POST");
      expect(init?.headers).toMatchObject({
        "Content-Type": "application/json",
        Accept: "application/json"
      });
      expect(JSON.parse(String(init?.body))).toEqual({
        environment: "sandbox",
        callbackUrl: "http://127.0.0.1:8765/callback",
        marketplaceId: "EBAY_US"
      });

      return new Response(
        JSON.stringify({
          authorizeUrl: "https://auth.sandbox.ebay.com/oauth2/authorize?client_id=backend-client-id",
          state: "backend-state",
          environment: "sandbox",
          marketplaceId: "EBAY_US",
          expiresAtUtc: "2099-01-01T00:00:00Z"
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await beginLocalEbayAuthorization(profile, {
      environment: "sandbox",
      callbackUrl: "http://127.0.0.1:8765/callback",
      marketplaceId: "EBAY_US"
    });

    expect(result.authorizeUrl).toContain("client_id=backend-client-id");
    expect(result.state).toBe("backend-state");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    rmSync(dir, { recursive: true, force: true });
  });

  it("rejects self-managed authorization when the requested environment does not match the configured app", async () => {
    const dir = useIsolatedConfigHome();
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

    rmSync(dir, { recursive: true, force: true });
  });

  it("refreshes expired local sessions and persists the new tokens before calling status", async () => {
    const dir = useIsolatedConfigHome();

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
    const dir = useIsolatedConfigHome();

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
    const dir = useIsolatedConfigHome();

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

  it("falls back to Browse detail when Trading GetItem fails for a legacy listing", async () => {
    const dir = useIsolatedConfigHome();

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
        accessToken: "user-access-token",
        refreshToken: "refresh-token",
        accessTokenExpiresAtUtc: "2099-01-01T00:00:00Z"
      },
      outputFormat: "json"
    });

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "https://api.ebay.com/sell/inventory/v1/listing/276784478357") {
        return new Response(
          JSON.stringify({ errors: [{ message: "Not found" }] }),
          { status: 404, headers: { "content-type": "application/json" } }
        );
      }

      if (url === "https://api.ebay.com/ws/api.dll") {
        expect((init?.headers as Record<string, string> | undefined)?.["X-EBAY-API-CALL-NAME"]).toBe("GetItem");
        return new Response(
          [
            "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
            "<GetItemResponse xmlns=\"urn:ebay:apis:eBLBaseComponents\">",
            "<Ack>Failure</Ack>",
            "<Errors>",
            "<ShortMessage>XML Parse error.</ShortMessage>",
            "<LongMessage>XML Parse error.</LongMessage>",
            "</Errors>",
            "</GetItemResponse>"
          ].join(""),
          { status: 200, headers: { "content-type": "text/xml" } }
        );
      }

      if (url === "https://api.ebay.com/identity/v1/oauth2/token") {
        return new Response(
          JSON.stringify({
            access_token: "app-access-token",
            expires_in: 7200,
            token_type: "Application Access Token"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url === "https://api.ebay.com/buy/browse/v1/item/get_item_by_legacy_id?legacy_item_id=276784478357") {
        expect((init?.headers as Record<string, string> | undefined)?.Authorization).toBe("Bearer app-access-token");
        return new Response(
          JSON.stringify({
            title: "Browse fallback listing",
            shortDescription: "Recovered through Browse",
            price: { value: "250.00", currency: "USD" },
            categoryIdPath: "1|2|261328",
            conditionId: "4000",
            condition: "Ungraded",
            image: { imageUrl: "https://example.test/image-1.jpg" },
            itemCreationDate: "2024-12-19T02:44:12.000Z",
            estimatedAvailabilities: [{ estimatedAvailabilityStatus: "IN_STOCK", estimatedRemainingQuantity: 1, estimatedSoldQuantity: 0 }]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      throw new Error(`Unexpected URL ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    try {
      const listing = await getLocalListing(profile, "276784478357");
      expect(listing).toEqual(expect.objectContaining({
        aggregate: expect.objectContaining({
          Source: "TRADING",
          LegacyItem: expect.objectContaining({
            detailSource: "BROWSE",
            title: "Browse fallback listing"
          })
        }),
        spec: expect.objectContaining({
          title: "Browse fallback listing",
          description: "Recovered through Browse",
          categoryId: "261328"
        })
      }));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("plans Trading create actions when the draft requests Trading write path", async () => {
    const dir = useIsolatedConfigHome();

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
        accessToken: "user-access-token",
        refreshToken: "refresh-token",
        accessTokenExpiresAtUtc: "2099-01-01T00:00:00Z",
        defaultPaymentPolicyId: "payment-1",
        defaultReturnPolicyId: "return-1",
        defaultFulfillmentPolicyId: "fulfillment-1"
      },
      outputFormat: "json"
    });

    try {
      const plan = await createLocalListingPlan(profile, {
        sku: "SKU-1",
        writePath: "TRADING",
        marketplaceId: "EBAY_US",
        title: "Sample listing",
        description: "Sample description",
        categoryId: "261328",
        condition: "4000",
        priceValue: 199.99,
        priceCurrency: "USD",
        availableQuantity: 1,
        country: "US",
        location: "Miami, FL",
        postalCode: "33126",
        policies: {
          paymentPolicyId: "payment-1",
          returnPolicyId: "return-1",
          fulfillmentPolicyId: "fulfillment-1"
        }
      });

      expect(plan.target).toEqual({ sku: "SKU-1", writePath: "TRADING" });
      expect(plan.actions.map((action) => action.type)).toEqual([
        "verifyAddFixedPriceItem",
        "addFixedPriceItem"
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
