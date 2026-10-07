import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createLocalListingPlan,
  createOrSetLocalLocation,
  getLocalConnectionStatus,
  listLocalListings,
  syncLocalPolicies
} from "../src/runtime.js";
import { loadProfiles, upsertProfile } from "../src/profile-config.js";
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

describe("local eBay operations", () => {
  it("uses the backend relay for refresh without local app credentials", async () => {
    const dir = useIsolatedConfigHome();

    const profile = upsertProfile({
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

      const persisted = loadProfiles()[0];
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

    const profile = upsertProfile({
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
      expect(loadProfiles()[0]?.ebaySession).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });


  it("persists local policy defaults and location defaults from seller API responses", async () => {
    const dir = useIsolatedConfigHome();

    const profile = upsertProfile({
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

      const persisted = loadProfiles()[0];
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

    const profile = upsertProfile({
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

    const profile = upsertProfile({
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
