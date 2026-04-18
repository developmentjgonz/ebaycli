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
});
