import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  beginLocalEbayAuthorization,
  createLocalListingPlan,
  createOrSetLocalLocation,
  getLocalConnectionStatus,
  listLocalListings,
  parseListingPatchFile,
  parseListingSpecFile,
  syncLocalPolicies
} from "../src/backend-domain.js";
import {
  loadBackendProfiles,
  requireConfiguredBackendProfile,
  requireLocalEbaySession,
  upsertBackendProfile
} from "../src/backend-config.js";
import { AppError } from "../src/errors.js";

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

describe("bootstrap guidance", () => {
  it("explains the production bootstrap path from an empty profile", () => {
    const dir = useIsolatedConfigHome();

    try {
      let thrown: unknown;
      try {
        requireConfiguredBackendProfile();
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(AppError);
      const error = thrown as AppError;
      expect(error.code).toBe("CONFIG_ERROR");
      expect(error.message).toContain("profile 'default'");
      expect(error.details).toEqual(
        expect.objectContaining({
          profile: "default",
          issue: "missing_backend_url",
          mode: "unconfigured",
          configured: {
            backendBaseUrl: false,
            ebaySession: false
          },
          nextCommands: [
            "ebay config set --backend-url https://your-backend.example.com --json",
            "ebay auth login --environment production --json",
            "ebay status --json"
          ],
          docs: expect.arrayContaining(["README.md", "cli/README.md"])
        })
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("treats a backend relay URL as sufficient production auth configuration", () => {
    const dir = useIsolatedConfigHome();
    upsertBackendProfile({
      name: "default",
      backendBaseUrl: "https://backend.example.test"
    });

    try {
      const profile = requireConfiguredBackendProfile();
      expect(profile.backendBaseUrl).toBe("https://backend.example.test");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("guides configured profiles to login when no eBay seller session exists", () => {
    const dir = useIsolatedConfigHome();
    const profile = upsertBackendProfile({
      name: "configured",
      backendBaseUrl: "https://backend.example.test"
    });

    try {
      let thrown: unknown;
      try {
        requireLocalEbaySession(profile);
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(AppError);
      const error = thrown as AppError;
      expect(error.code).toBe("AUTH_REQUIRED");
      expect(error.details).toEqual(
        expect.objectContaining({
          profile: "configured",
          issue: "missing_ebay_session",
          mode: "backend-relay",
          configured: {
            backendBaseUrl: true,
            ebaySession: false
          },
          nextCommands: [
            "ebay auth login --environment production --json",
            "ebay status --json"
          ]
        })
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("local eBay session flows", () => {
  it("uses the backend relay for authorization start with only a backend URL configured", async () => {
    const dir = useIsolatedConfigHome();
    const profile = upsertBackendProfile({
      name: "backend-relay",
      backendBaseUrl: "https://backend.example.test"
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

  it("uses the backend relay for refresh without local app credentials", async () => {
    const dir = useIsolatedConfigHome();

    const profile = upsertBackendProfile({
      name: "relay-refresh",
      backendBaseUrl: "https://backend.example.test",
      ebaySession: {
        environment: "sandbox",
        marketplaceId: "EBAY_US",
        accessToken: "expired-access-token",
        refreshToken: "refresh-token-1",
        accessTokenExpiresAtUtc: "2000-01-01T00:00:00Z",
        defaultPaymentPolicyId: "payment-1",
        defaultReturnPolicyId: "return-1",
        defaultFulfillmentPolicyId: "fulfillment-1",
        defaultLocationKey: "warehouse-a"
      },
      outputFormat: "json"
    });

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "https://backend.example.test/api/local/ebay/refresh") {
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({
          environment: "sandbox",
          marketplaceId: "EBAY_US",
          refreshToken: "refresh-token-1",
          refreshTokenExpiresAtUtc: undefined,
          defaultPaymentPolicyId: "payment-1",
          defaultReturnPolicyId: "return-1",
          defaultFulfillmentPolicyId: "fulfillment-1",
          defaultLocationKey: "warehouse-a"
        });
        return new Response(
          JSON.stringify({
            environment: "sandbox",
            marketplaceId: "EBAY_US",
            accessToken: "backend-access-token",
            refreshToken: "refresh-token-1",
            accessTokenExpiresAtUtc: "2099-01-01T00:00:00Z",
            ebayUsername: "testuser_refresh",
            sellerRegistrationCompleted: true,
            defaultPaymentPolicyId: "payment-1",
            defaultReturnPolicyId: "return-1",
            defaultFulfillmentPolicyId: "fulfillment-1",
            defaultLocationKey: "warehouse-a"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.endsWith("/commerce/identity/v1/user/")) {
        expect((init?.headers as Record<string, string> | undefined)?.Authorization).toBe("Bearer backend-access-token");
        return new Response(
          JSON.stringify({
            userId: "user-123",
            username: "testuser_refresh"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.endsWith("/sell/account/v1/privilege")) {
        expect((init?.headers as Record<string, string> | undefined)?.Authorization).toBe("Bearer backend-access-token");
        return new Response(
          JSON.stringify({ sellerRegistrationCompleted: true }),
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

      const persisted = loadBackendProfiles()[0];
      expect(persisted?.ebaySession?.accessToken).toBe("backend-access-token");
      expect(persisted?.ebaySession?.refreshToken).toBe("refresh-token-1");
      expect(persisted?.ebaySession?.defaultPaymentPolicyId).toBe("payment-1");
      expect(fetchMock).toHaveBeenCalledTimes(3);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("clears the local seller session when the backend reports revoked auth", async () => {
    const dir = useIsolatedConfigHome();

    const profile = upsertBackendProfile({
      name: "revoked-refresh",
      backendBaseUrl: "https://backend.example.test",
      ebaySession: {
        environment: "production",
        marketplaceId: "EBAY_US",
        accessToken: "expired-access-token",
        refreshToken: "revoked-refresh-token",
        accessTokenExpiresAtUtc: "2000-01-01T00:00:00Z"
      }
    });

    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe("https://backend.example.test/api/local/ebay/refresh");
      return new Response(
        JSON.stringify({
          title: "local_ebay_auth_revoked",
          detail: "The eBay authorization for this local seller session has been revoked or expired.",
          status: 401
        }),
        { status: 401, headers: { "content-type": "application/problem+json" } }
      );
    });

    vi.stubGlobal("fetch", fetchMock);

    try {
      let thrown: unknown;
      try {
        await getLocalConnectionStatus(profile);
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(AppError);
      expect((thrown as AppError).code).toBe("AUTH_REVOKED");
      expect(loadBackendProfiles()[0]?.ebaySession).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });


  it("persists local policy defaults and location defaults from seller API responses", async () => {
    const dir = useIsolatedConfigHome();

    const profile = upsertBackendProfile({
      name: "default",
      backendBaseUrl: "https://backend.example.test",
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
      backendBaseUrl: "https://backend.example.test",
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

  it("plans Trading create actions when the draft requests Trading write path", async () => {
    const dir = useIsolatedConfigHome();

    const profile = upsertBackendProfile({
      name: "default",
      backendBaseUrl: "https://backend.example.test",
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
