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
        writePath: "TRADING",
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
        "<ConditionDescriptors>",
        "  <ConditionDescriptor>",
        "    <Name>40001</Name>",
        "    <Value>400010</Value>",
        "  </ConditionDescriptor>",
        "</ConditionDescriptors>",
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
      viewItemUrl: "https://www.ebay.com/itm/276784478357",
      conditionDescriptors: [
        {
          name: "40001",
          values: ["400010"]
        }
      ]
    }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends both Accept-Language and Content-Language on Inventory reads", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect((init?.headers as Record<string, string> | undefined)?.["Accept-Language"]).toBe("en-US");
      expect((init?.headers as Record<string, string> | undefined)?.["Content-Language"]).toBe("en-US");
      return new Response(
        JSON.stringify({ total: 0, offers: [] }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });

    vi.stubGlobal("fetch", fetchMock);

    const client = new EbayApiClient(resolveEbayEnvironment("production"));
    const offers = await client.getOffers("test-access-token", "SKU-1");

    expect(offers).toEqual({ total: 0, offers: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends VerifyAddFixedPriceItem with the expected Trading envelope and parses summary data", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect((init?.headers as Record<string, string> | undefined)?.["X-EBAY-API-CALL-NAME"]).toBe("VerifyAddFixedPriceItem");
      const body = String(init?.body);
      expect(body.startsWith("<?xml version=\"1.0\" encoding=\"utf-8\"?>")).toBe(true);
      expect(body).toContain("<VerifyAddFixedPriceItemRequest");
      expect(body).toContain("<SKU>SKU-1</SKU>");
      expect(body).toContain("<Title>Sample listing</Title>");
      return new Response(
        [
          "<VerifyAddFixedPriceItemResponse xmlns=\"urn:ebay:apis:eBLBaseComponents\">",
          "  <Ack>Warning</Ack>",
          "  <Fees>",
          "    <Fee>",
          "      <Name>ListingFee</Name>",
          "      <Fee currencyID=\"USD\">0.35</Fee>",
          "    </Fee>",
          "  </Fees>",
          "  <Errors>",
          "    <ShortMessage>Policy warning</ShortMessage>",
          "    <LongMessage>Policy warning</LongMessage>",
          "  </Errors>",
          "</VerifyAddFixedPriceItemResponse>"
        ].join(""),
        { status: 200, headers: { "content-type": "text/xml" } }
      );
    });

    vi.stubGlobal("fetch", fetchMock);

    const client = new EbayApiClient(resolveEbayEnvironment("production"));
    const result = await client.verifyAddFixedPriceItem("test-access-token", "EBAY_US", {
      Item: {
        SKU: "SKU-1",
        Title: "Sample listing"
      }
    });

    expect(result).toEqual(expect.objectContaining({
      callName: "VerifyAddFixedPriceItem",
      ack: "Warning",
      fees: [
        expect.objectContaining({
          name: "ListingFee",
          fee: 0.35,
          currency: "USD"
        })
      ],
      warnings: ["Policy warning"]
    }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
