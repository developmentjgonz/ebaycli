import { describe, expect, it, vi } from "vitest";

import { EbayApiClient, resolveEbayEnvironment } from "../src/ebay-api.js";

describe("EbayApiClient trading responses", () => {
  it("parses active listings when the XML response includes a declaration", async () => {
    const fetchMock = vi.fn(async () => new Response(
      [
        "<?xml version='1.0' encoding='UTF-8'?>",
        "<GetMyeBaySellingResponse xmlns=\"urn:ebay:apis:eBLBaseComponents\">",
        "<Timestamp>2026-04-18T15:25:35.818Z</Timestamp>",
        "<Ack>Success</Ack>",
        "<Version>1271</Version>",
        "<ActiveList>",
        "<ItemArray>",
        "<Item>",
        "<ItemID>276784478357</ItemID>",
        "<Title>Sample listing</Title>",
        "<Quantity>1</Quantity>",
        "<QuantityAvailable>1</QuantityAvailable>",
        "<SellingStatus>",
        "<CurrentPrice currencyID=\"USD\">250.0</CurrentPrice>",
        "</SellingStatus>",
        "<ListingDetails>",
        "<ViewItemURL>https://www.ebay.com/itm/276784478357</ViewItemURL>",
        "</ListingDetails>",
        "</Item>",
        "</ItemArray>",
        "</ActiveList>",
        "</GetMyeBaySellingResponse>"
      ].join(""),
      { status: 200, headers: { "content-type": "text/xml" } }
    ));

    vi.stubGlobal("fetch", fetchMock);

    const client = new EbayApiClient(resolveEbayEnvironment("production"));
    const listings = await client.getActiveListings("test-access-token", "EBAY_US", 1, 5);

    expect(listings).toEqual([
      expect.objectContaining({
        listingId: "276784478357",
        title: "Sample listing",
        priceValue: 250,
        priceCurrency: "USD",
        source: "TRADING",
        listingUrl: "https://www.ebay.com/itm/276784478357"
      })
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("parses legacy listing detail when the XML response includes a declaration", async () => {
    const fetchMock = vi.fn(async () => new Response(
      [
        "<?xml version='1.0' encoding='UTF-8'?>",
        "<GetItemResponse xmlns=\"urn:ebay:apis:eBLBaseComponents\">",
        "<Timestamp>2026-04-18T15:25:35.818Z</Timestamp>",
        "<Ack>Success</Ack>",
        "<Version>1271</Version>",
        "<Item>",
        "<ItemID>276784478357</ItemID>",
        "<Title>Sample listing</Title>",
        "<StartPrice currencyID=\"USD\">250.0</StartPrice>",
        "<Quantity>1</Quantity>",
        "<ListingDetails>",
        "<ViewItemURL>https://www.ebay.com/itm/276784478357</ViewItemURL>",
        "</ListingDetails>",
        "</Item>",
        "</GetItemResponse>"
      ].join(""),
      { status: 200, headers: { "content-type": "text/xml" } }
    ));

    vi.stubGlobal("fetch", fetchMock);

    const client = new EbayApiClient(resolveEbayEnvironment("production"));
    const listing = await client.getLegacyListing("test-access-token", "EBAY_US", "276784478357");

    expect(listing).toEqual(expect.objectContaining({
      source: "TRADING",
      listingId: "276784478357",
      title: "Sample listing",
      startPrice: 250,
      priceCurrency: "USD",
      viewItemUrl: "https://www.ebay.com/itm/276784478357"
    }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("parses legacy listing detail through Browse fallback", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/identity/v1/oauth2/token")) {
        expect(String(init?.body)).toContain("grant_type=client_credentials");
        return new Response(
          JSON.stringify({
            access_token: "app-access-token",
            expires_in: 7200,
            token_type: "Application Access Token"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      expect(url).toContain("/buy/browse/v1/item/get_item_by_legacy_id?legacy_item_id=276784478357");
      expect((init?.headers as Record<string, string> | undefined)?.Authorization).toBe("Bearer app-access-token");
      expect((init?.headers as Record<string, string> | undefined)?.["X-EBAY-C-MARKETPLACE-ID"]).toBe("EBAY_US");
      return new Response(
        JSON.stringify({
          title: "Sample listing",
          shortDescription: "Sample browse description",
          price: { value: "250.00", currency: "USD" },
          categoryPath: "A|B|Trading Card Singles",
          categoryIdPath: "1|2|261328",
          condition: "Ungraded",
          conditionId: "4000",
          itemLocation: { city: "Miami", stateOrProvince: "FL", postalCode: "33155", country: "US" },
          image: { imageUrl: "https://example.test/image-1.jpg" },
          additionalImages: [{ imageUrl: "https://example.test/image-2.jpg" }],
          itemCreationDate: "2024-12-19T02:44:12.000Z",
          estimatedAvailabilities: [{ estimatedAvailabilityStatus: "IN_STOCK", estimatedRemainingQuantity: 1, estimatedSoldQuantity: 0 }],
          localizedAspects: [{ name: "Player/Athlete", value: "Kevin Durant" }]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });

    vi.stubGlobal("fetch", fetchMock);

    const client = new EbayApiClient(resolveEbayEnvironment("production"));
    const listing = await client.getLegacyListingBrowse(
      {
        name: "production",
        clientId: "client-id",
        clientSecret: "client-secret",
        runame: "runame"
      },
      "EBAY_US",
      "276784478357"
    );

    expect(listing).toEqual(expect.objectContaining({
      source: "TRADING",
      detailSource: "BROWSE",
      listingId: "276784478357",
      title: "Sample listing",
      description: "Sample browse description",
      categoryId: "261328",
      conditionId: "4000",
      priceCurrency: "USD"
    }));
    expect(listing.pictureUrls).toEqual([
      "https://example.test/image-1.jpg",
      "https://example.test/image-2.jpg"
    ]);
    expect(listing.itemSpecifics).toEqual({
      "Player/Athlete": ["Kevin Durant"]
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
