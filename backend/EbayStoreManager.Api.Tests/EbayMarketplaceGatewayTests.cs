using System.Net;
using System.Text.Json.Nodes;
using EbayStoreManager.Api.Configuration;
using EbayStoreManager.Api.Services;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace EbayStoreManager.Api.Tests;

public sealed class EbayMarketplaceGatewayTests
{
    [Fact]
    public async Task UpsertInventoryItem_UsesMarketplaceLocaleForContentLanguage()
    {
        var handler = new RecordingHandler(_ => new HttpResponseMessage(HttpStatusCode.NoContent));
        var gateway = CreateGateway(handler);
        var environment = new EbayEnvironmentDescriptor(
            "sandbox",
            "client",
            "secret",
            "runame",
            "https://auth.example.com/oauth2",
            "https://api.example.com",
            "https://identity.example.com",
            "https://media.example.com",
            "https://api.example.com/ws/api.dll");

        await gateway.UpsertInventoryItemAsync(
            environment,
            "access-token",
            "SKU-1",
            new JsonObject
            {
                ["product"] = new JsonObject
                {
                    ["title"] = "Desk lamp",
                    ["description"] = "Brass lamp"
                }
            },
            locale: null,
            marketplaceId: "EBAY_US",
            cancellationToken: CancellationToken.None);

        Assert.NotNull(handler.LastRequest);
        Assert.Equal("en-US", handler.LastRequest!.Content?.Headers.GetValues("Content-Language").Single());
    }

    [Fact]
    public async Task OptInToProgram_SendsSellingPolicyManagementPayload()
    {
        var handler = new RecordingHandler(_ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent("{\"programType\":\"SELLING_POLICY_MANAGEMENT\"}")
        });
        var gateway = CreateGateway(handler);
        var environment = new EbayEnvironmentDescriptor(
            "production",
            "client",
            "secret",
            "runame",
            "https://auth.example.com/oauth2",
            "https://api.example.com",
            "https://identity.example.com",
            "https://media.example.com",
            "https://api.example.com/ws/api.dll");

        await gateway.OptInToProgramAsync(environment, "access-token", "SELLING_POLICY_MANAGEMENT", CancellationToken.None);

        Assert.NotNull(handler.LastRequest);
        Assert.Equal(HttpMethod.Post, handler.LastRequest!.Method);
        Assert.Equal("https://api.example.com/sell/account/v1/program/opt_in", handler.LastRequest.RequestUri?.ToString());
        Assert.Contains("\"programType\":\"SELLING_POLICY_MANAGEMENT\"", handler.LastContent ?? string.Empty);
    }

    [Fact]
    public async Task GetActiveListings_ParsesTradingApiResponse()
    {
        const string responseXml = """
            <?xml version="1.0" encoding="utf-8"?>
            <GetMyeBaySellingResponse xmlns="urn:ebay:apis:eBLBaseComponents">
              <Ack>Success</Ack>
              <ActiveList>
                <ItemArray>
                  <Item>
                    <ItemID>1234567890</ItemID>
                    <SKU>SKU-123</SKU>
                    <Title>Desk lamp</Title>
                    <QuantityAvailable>2</QuantityAvailable>
                    <SellingStatus>
                      <CurrentPrice currencyID="USD">19.99</CurrentPrice>
                      <ListingStatus>Active</ListingStatus>
                    </SellingStatus>
                  </Item>
                </ItemArray>
              </ActiveList>
            </GetMyeBaySellingResponse>
            """;
        var handler = new RecordingHandler(_ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(responseXml)
        });
        var gateway = CreateGateway(handler);
        var environment = new EbayEnvironmentDescriptor(
            "production",
            "client",
            "secret",
            "runame",
            "https://auth.example.com/oauth2",
            "https://api.example.com",
            "https://identity.example.com",
            "https://media.example.com",
            "https://api.example.com/ws/api.dll");

        var listings = await gateway.GetActiveListingsAsync(environment, "access-token", "EBAY_US", 1, 200, CancellationToken.None);

        Assert.Single(listings);
        Assert.Equal("1234567890", listings[0]["listingId"]?.GetValue<string>());
        Assert.Equal("SKU-123", listings[0]["sku"]?.GetValue<string>());
        Assert.Equal("Desk lamp", listings[0]["title"]?.GetValue<string>());
        Assert.Equal("Active", listings[0]["status"]?.GetValue<string>());
        Assert.Equal(19.99m, listings[0]["priceValue"]?.GetValue<decimal?>());
        Assert.Equal("TRADING", listings[0]["source"]?.GetValue<string>());
    }

    [Fact]
    public async Task GetSoldListings_ParsesTradingApiResponse()
    {
        const string responseXml = """
            <?xml version="1.0" encoding="utf-8"?>
            <GetMyeBaySellingResponse xmlns="urn:ebay:apis:eBLBaseComponents">
              <Ack>Success</Ack>
              <SoldList>
                <OrderTransactionArray>
                  <OrderTransaction>
                    <Transaction>
                      <CreatedDate>2026-03-21T01:10:56.000Z</CreatedDate>
                      <TransactionPrice currencyID="USD">400.00</TransactionPrice>
                      <QuantityPurchased>1</QuantityPurchased>
                      <Buyer>
                        <UserID>buyer-one</UserID>
                      </Buyer>
                    </Transaction>
                    <Item>
                      <ItemID>276784472581</ItemID>
                      <Title>Card listing</Title>
                      <SKU>SKU-SOLD-1</SKU>
                      <SellingStatus>
                        <ListingStatus>Completed</ListingStatus>
                        <QuantitySold>1</QuantitySold>
                      </SellingStatus>
                    </Item>
                  </OrderTransaction>
                </OrderTransactionArray>
              </SoldList>
            </GetMyeBaySellingResponse>
            """;
        var handler = new RecordingHandler(_ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(responseXml)
        });
        var gateway = CreateGateway(handler);
        var environment = new EbayEnvironmentDescriptor(
            "production",
            "client",
            "secret",
            "runame",
            "https://auth.example.com/oauth2",
            "https://api.example.com",
            "https://identity.example.com",
            "https://media.example.com",
            "https://api.example.com/ws/api.dll");

        var listings = await gateway.GetSoldListingsAsync(environment, "access-token", "EBAY_US", 30, 1, 50, CancellationToken.None);

        Assert.Single(listings);
        Assert.Equal("276784472581", listings[0]["listingId"]?.GetValue<string>());
        Assert.Equal("SKU-SOLD-1", listings[0]["sku"]?.GetValue<string>());
        Assert.Equal("buyer-one", listings[0]["buyerUsername"]?.GetValue<string>());
        Assert.Equal(400.00m, listings[0]["priceValue"]?.GetValue<decimal?>());
        Assert.Equal("TRADING", listings[0]["source"]?.GetValue<string>());
    }

    [Fact]
    public async Task GetLegacyListing_ParsesTradingItemResponse()
    {
        const string responseXml = """
            <?xml version="1.0" encoding="utf-8"?>
            <GetItemResponse xmlns="urn:ebay:apis:eBLBaseComponents">
              <Ack>Success</Ack>
              <Item>
                <ItemID>276784478357</ItemID>
                <SKU>SKU-DETAIL-1</SKU>
                <Title>Kevin Durant Auto</Title>
                <Description>Detailed description</Description>
                <PrimaryCategory>
                  <CategoryID>261328</CategoryID>
                  <CategoryName>Trading Card Singles</CategoryName>
                </PrimaryCategory>
                <ConditionID>4000</ConditionID>
                <ConditionDisplayName>Ungraded</ConditionDisplayName>
                <ListingType>FixedPriceItem</ListingType>
                <StartPrice currencyID="USD">250.00</StartPrice>
                <Quantity>1</Quantity>
                <QuantityAvailable>1</QuantityAvailable>
                <ListingDetails>
                  <ViewItemURL>https://www.ebay.com/itm/276784478357</ViewItemURL>
                </ListingDetails>
                <PictureDetails>
                  <PictureURL>https://i.example.com/1.jpg</PictureURL>
                </PictureDetails>
                <ItemSpecifics>
                  <NameValueList>
                    <Name>Player/Athlete</Name>
                    <Value>Kevin Durant</Value>
                  </NameValueList>
                </ItemSpecifics>
              </Item>
            </GetItemResponse>
            """;
        var handler = new RecordingHandler(_ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(responseXml)
        });
        var gateway = CreateGateway(handler);
        var environment = new EbayEnvironmentDescriptor(
            "production",
            "client",
            "secret",
            "runame",
            "https://auth.example.com/oauth2",
            "https://api.example.com",
            "https://identity.example.com",
            "https://media.example.com",
            "https://api.example.com/ws/api.dll");

        var item = await gateway.GetLegacyListingAsync(environment, "access-token", "EBAY_US", "276784478357", CancellationToken.None);

        Assert.Equal("276784478357", item["listingId"]?.GetValue<string>());
        Assert.Equal("SKU-DETAIL-1", item["sku"]?.GetValue<string>());
        Assert.Equal("Kevin Durant Auto", item["title"]?.GetValue<string>());
        Assert.Equal("261328", item["categoryId"]?.GetValue<string>());
        Assert.Equal("TRADING", item["source"]?.GetValue<string>());
    }

    [Fact]
    public async Task ReviseInventoryStatus_SendsTradingPayload()
    {
        const string responseXml = """
            <?xml version="1.0" encoding="utf-8"?>
            <ReviseInventoryStatusResponse xmlns="urn:ebay:apis:eBLBaseComponents">
              <Ack>Success</Ack>
              <InventoryStatus>
                <ItemID>276784478357</ItemID>
                <SKU>SKU-123</SKU>
              </InventoryStatus>
            </ReviseInventoryStatusResponse>
            """;
        var handler = new RecordingHandler(_ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(responseXml)
        });
        var gateway = CreateGateway(handler);
        var environment = new EbayEnvironmentDescriptor(
            "production",
            "client",
            "secret",
            "runame",
            "https://auth.example.com/oauth2",
            "https://api.example.com",
            "https://identity.example.com",
            "https://media.example.com",
            "https://api.example.com/ws/api.dll");

        var result = await gateway.ReviseInventoryStatusAsync(environment, "access-token", "EBAY_US", "276784478357", "SKU-123", 249.99m, "USD", 1, CancellationToken.None);

        Assert.NotNull(handler.LastRequest);
        Assert.Equal("ReviseInventoryStatus", handler.LastRequest!.Headers.GetValues("X-EBAY-API-CALL-NAME").Single());
        Assert.Contains("<ItemID>276784478357</ItemID>", handler.LastContent ?? string.Empty);
        Assert.Contains("<SKU>SKU-123</SKU>", handler.LastContent ?? string.Empty);
        Assert.Contains("<StartPrice currencyID=\"USD\">249.99</StartPrice>", handler.LastContent ?? string.Empty);
        Assert.Equal("276784478357", result["itemId"]?.GetValue<string>());
    }

    [Fact]
    public async Task ReviseFixedPriceItem_SendsTradingPayload()
    {
        const string responseXml = """
            <?xml version="1.0" encoding="utf-8"?>
            <ReviseFixedPriceItemResponse xmlns="urn:ebay:apis:eBLBaseComponents">
              <Ack>Success</Ack>
              <ItemID>276784478357</ItemID>
              <SKU>SKU-123</SKU>
            </ReviseFixedPriceItemResponse>
            """;
        var handler = new RecordingHandler(_ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(responseXml)
        });
        var gateway = CreateGateway(handler);
        var environment = new EbayEnvironmentDescriptor(
            "production",
            "client",
            "secret",
            "runame",
            "https://auth.example.com/oauth2",
            "https://api.example.com",
            "https://identity.example.com",
            "https://media.example.com",
            "https://api.example.com/ws/api.dll");

        var payload = new JsonObject
        {
            ["listingId"] = "276784478357",
            ["sku"] = "SKU-123",
            ["title"] = "Updated title",
            ["description"] = "Updated description",
            ["categoryId"] = "261328",
            ["conditionId"] = "4000",
            ["priceValue"] = 250.00m,
            ["priceCurrency"] = "USD",
            ["quantity"] = 1,
            ["pictureUrls"] = new JsonArray("https://i.example.com/1.jpg"),
            ["itemSpecifics"] = new JsonObject
            {
                ["Player/Athlete"] = new JsonArray("Kevin Durant")
            }
        };

        var result = await gateway.ReviseFixedPriceItemAsync(environment, "access-token", "EBAY_US", payload, CancellationToken.None);

        Assert.NotNull(handler.LastRequest);
        Assert.Equal("ReviseFixedPriceItem", handler.LastRequest!.Headers.GetValues("X-EBAY-API-CALL-NAME").Single());
        Assert.Contains("<Title>Updated title</Title>", handler.LastContent ?? string.Empty);
        Assert.Contains("<CategoryID>261328</CategoryID>", handler.LastContent ?? string.Empty);
        Assert.Contains("<PictureURL>https://i.example.com/1.jpg</PictureURL>", handler.LastContent ?? string.Empty);
        Assert.Contains("<Name>Player/Athlete</Name>", handler.LastContent ?? string.Empty);
        Assert.Equal("SKU-123", result["sku"]?.GetValue<string>());
    }

    [Fact]
    public async Task EndFixedPriceItem_SendsTradingPayload()
    {
        const string responseXml = """
            <?xml version="1.0" encoding="utf-8"?>
            <EndFixedPriceItemResponse xmlns="urn:ebay:apis:eBLBaseComponents">
              <Ack>Success</Ack>
              <EndTime>2026-04-16T20:00:00.000Z</EndTime>
            </EndFixedPriceItemResponse>
            """;
        var handler = new RecordingHandler(_ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(responseXml)
        });
        var gateway = CreateGateway(handler);
        var environment = new EbayEnvironmentDescriptor(
            "production",
            "client",
            "secret",
            "runame",
            "https://auth.example.com/oauth2",
            "https://api.example.com",
            "https://identity.example.com",
            "https://media.example.com",
            "https://api.example.com/ws/api.dll");

        var result = await gateway.EndFixedPriceItemAsync(environment, "access-token", "EBAY_US", "276784478357", "NotAvailable", CancellationToken.None);

        Assert.NotNull(handler.LastRequest);
        Assert.Equal("EndFixedPriceItem", handler.LastRequest!.Headers.GetValues("X-EBAY-API-CALL-NAME").Single());
        Assert.Contains("<EndingReason>NotAvailable</EndingReason>", handler.LastContent ?? string.Empty);
        Assert.Contains("<ItemID>276784478357</ItemID>", handler.LastContent ?? string.Empty);
        Assert.NotNull(result["endTimeUtc"]?.GetValue<string>());
    }

    [Fact]
    public async Task RefreshAccessToken_WhenEbayReturnsInvalidGrant_ThrowsRevokedException()
    {
        var handler = new RecordingHandler(_ => new HttpResponseMessage(HttpStatusCode.BadRequest)
        {
            Content = new StringContent("{\"error\":\"invalid_grant\",\"error_description\":\"refresh token revoked\"}")
        });
        var gateway = CreateGateway(handler);
        var environment = new EbayEnvironmentDescriptor(
            "production",
            "client",
            "secret",
            "runame",
            "https://auth.example.com/oauth2",
            "https://api.example.com",
            "https://identity.example.com",
            "https://media.example.com",
            "https://api.example.com/ws/api.dll");

        var exception = await Assert.ThrowsAsync<EbayApiException>(() =>
            gateway.RefreshAccessTokenAsync(
                environment,
                "revoked-refresh-token",
                ["https://api.ebay.com/oauth/api_scope"],
                CancellationToken.None));

        Assert.True(exception.IsAuthorizationRevoked);
        Assert.Equal(HttpStatusCode.BadRequest, exception.StatusCode);
        Assert.Contains("invalid_grant", exception.Payload);
    }

    private sealed class SingleClientFactory(HttpClient client) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => client;
    }

    private static EbayMarketplaceGateway CreateGateway(RecordingHandler handler)
        => new(
            new SingleClientFactory(new HttpClient(handler)),
            Options.Create(new OperationalOptions
            {
                EbayRetries = new EbayRetryOptions
                {
                    MaxAttempts = 2,
                    BaseDelayMilliseconds = 1
                }
            }),
            NullLogger<EbayMarketplaceGateway>.Instance);

    private sealed class RecordingHandler(Func<HttpRequestMessage, HttpResponseMessage> responder) : HttpMessageHandler
    {
        public HttpRequestMessage? LastRequest { get; private set; }
        public string? LastContent { get; private set; }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            LastRequest = request;
            if (request.Content is not null)
            {
                LastContent = await request.Content.ReadAsStringAsync(cancellationToken);
            }
            return responder(request);
        }
    }
}
