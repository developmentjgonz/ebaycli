import { afterEach, describe, expect, it, vi } from "vitest";

import { EbayApiClient, resolveEbayEnvironment } from "../src/ebay-api.js";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

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

describe("EbayApiClient retry safety", () => {
  const client = () => new EbayApiClient(resolveEbayEnvironment("sandbox"));
  const writes: Array<[string, (api: EbayApiClient) => Promise<unknown>]> = [
    ["Inventory offer creation", api => api.createOffer("token", { sku: "SKU-1" })],
    ["policy creation", api => api.createPaymentPolicy("token", { name: "policy" })],
    ["Trading listing creation", api => api.addFixedPriceItem("token", "EBAY_US", { Item: { SKU: "SKU-1" } })]
  ];

  it("retries safe reads after network failures and stops after three attempts", async () => {
    vi.useFakeTimers();
    const error = new TypeError("Connection closed");
    const fetch = vi.fn().mockRejectedValue(error);
    vi.stubGlobal("fetch", fetch);
    const result = expect(client().getOffers("token")).rejects.toBe(error);

    await vi.runAllTimersAsync();
    await result;
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("retries 503 and 429 read responses before returning the successful result", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response("temporarily unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response("slow down", { status: 429 }))
      .mockResolvedValueOnce(Response.json({ offers: [] }));
    vi.stubGlobal("fetch", fetch);
    const result = expect(client().getOffers("token")).resolves.toEqual({ offers: [] });

    await vi.runAllTimersAsync();
    await result;
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it.each(["2", "Tue, 06 Oct 2026 12:00:02 GMT"])("honors Retry-After %s for safe reads", async (retryAfter) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-06T12:00:00Z"));
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response("slow down", { status: 429, headers: { "Retry-After": retryAfter } }))
      .mockResolvedValueOnce(Response.json({ offers: [] }));
    vi.stubGlobal("fetch", fetch);
    const result = expect(client().getOffers("token")).resolves.toEqual({ offers: [] });

    await vi.advanceTimersByTimeAsync(1999);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await result;
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not ignore an upstream Retry-After longer than the bounded retry window", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("slow down", { status: 429, headers: { "Retry-After": "60" } }));
    vi.stubGlobal("fetch", fetch);

    await expect(client().getOffers("token")).rejects.toMatchObject({
      code: "EBAY_API_ERROR", message: expect.stringContaining("retry after the Retry-After interval")
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("retries a known Trading read despite its POST transport", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn()
      .mockRejectedValueOnce(new TypeError("Connection closed"))
      .mockResolvedValueOnce(new Response("<GetMyeBaySellingResponse><Ack>Success</Ack><ActiveList/></GetMyeBaySellingResponse>"));
    vi.stubGlobal("fetch", fetch);
    const result = expect(client().getActiveListings("token", "EBAY_US", 1, 5)).resolves.toEqual([]);

    await vi.runAllTimersAsync();
    await result;
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each(writes)("does not repeat %s after an ambiguous network failure", async (_name, write) => {
    const fetch = vi.fn().mockRejectedValue(new TypeError("Connection closed after submission"));
    vi.stubGlobal("fetch", fetch);

    await expect(write(client())).rejects.toMatchObject({
      code: "EBAY_API_ERROR", message: expect.stringContaining("may have succeeded")
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(writes)("does not repeat %s after a server error", async (_name, write) => {
    const fetch = vi.fn().mockResolvedValue(new Response("temporarily unavailable", { status: 503 }));
    vi.stubGlobal("fetch", fetch);

    await expect(write(client())).rejects.toMatchObject({
      code: "EBAY_API_ERROR",
      message: expect.stringContaining("Inspect the seller account or listing state before repeating it"),
      details: "temporarily unavailable"
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
