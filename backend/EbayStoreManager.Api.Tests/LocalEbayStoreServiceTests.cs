using System.Text.Json;
using System.Text.Json.Nodes;
using EbayStoreManager.Api.Configuration;
using EbayStoreManager.Api.Contracts;
using EbayStoreManager.Api.Services;
using Microsoft.Extensions.Options;

namespace EbayStoreManager.Api.Tests;

public sealed class LocalEbayStoreServiceTests
{
    [Fact]
    public async Task PlanUpdateAsync_UsesTradingActionForLegacyPriceQuantity()
    {
        var gateway = new FakeMarketplaceGateway
        {
            LegacyListing = BuildLegacyListing()
        };
        var service = CreateService(gateway);

        var plan = await service.PlanUpdateAsync(
            Session(),
            "276784478357",
            new ListingPatchDto(null, null, null, null, null, null, null, null, 255m, "USD", 1, null, null, null, null, null, null, null),
            CancellationToken.None);

        Assert.Single(plan.Actions);
        Assert.Equal("reviseInventoryStatus", plan.Actions[0].Type);
    }

    [Fact]
    public async Task UpdateListingAsync_UsesTradingReviseInventoryStatusForLegacyPriceQuantity()
    {
        var gateway = new FakeMarketplaceGateway
        {
            LegacyListing = BuildLegacyListing(),
            ReviseInventoryStatusResponse = new JsonObject
            {
                ["ack"] = "Success",
                ["itemId"] = "276784478357"
            }
        };
        var service = CreateService(gateway);

        var result = await service.UpdateListingAsync(
            Session(),
            "276784478357",
            new ListingPatchDto(null, null, null, null, null, null, null, null, 255m, "USD", 1, null, null, null, null, null, null, null),
            CancellationToken.None);

        Assert.True(gateway.ReviseInventoryStatusCalled);
        Assert.False(gateway.BulkUpdatePriceQuantityCalled);
        Assert.Equal("TRADING", result["source"]?.GetValue<string>());
    }

    [Fact]
    public async Task UpdateListingAsync_UsesTradingReviseFixedPriceItemForLegacyFieldChanges()
    {
        var gateway = new FakeMarketplaceGateway
        {
            LegacyListing = BuildLegacyListing(),
            ReviseFixedPriceItemResponse = new JsonObject
            {
                ["ack"] = "Success",
                ["itemId"] = "276784478357"
            }
        };
        var service = CreateService(gateway);

        var result = await service.UpdateListingAsync(
            Session(),
            "276784478357",
            new ListingPatchDto(null, null, "Updated title", null, null, null, null, null, 255m, "USD", 1, null, null, null, null, null, null, null),
            CancellationToken.None);

        Assert.True(gateway.ReviseFixedPriceItemCalled);
        Assert.NotNull(gateway.LastReviseFixedPriceItemPayload);
        Assert.Equal("Updated title", gateway.LastReviseFixedPriceItemPayload!["title"]?.GetValue<string>());
        Assert.Equal("TRADING", result["source"]?.GetValue<string>());
    }

    [Fact]
    public async Task EndListingAsync_UsesTradingEndForLegacyListings()
    {
        var gateway = new FakeMarketplaceGateway
        {
            LegacyListing = BuildLegacyListing(),
            EndFixedPriceItemResponse = new JsonObject
            {
                ["ack"] = "Success"
            }
        };
        var service = CreateService(gateway);

        var plan = await service.PlanEndAsync(Session(), "276784478357", CancellationToken.None);
        var result = await service.EndListingAsync(Session(), "276784478357", CancellationToken.None);

        Assert.Single(plan.Actions);
        Assert.Equal("endFixedPriceItem", plan.Actions[0].Type);
        Assert.True(gateway.EndFixedPriceItemCalled);
        Assert.Equal("TRADING", result["source"]?.GetValue<string>());
    }

    [Fact]
    public async Task UpdateListingAsync_UsesInventoryBulkUpdateForInventoryPriceQuantity()
    {
        var gateway = new FakeMarketplaceGateway
        {
            Listing = new JsonObject
            {
                ["sku"] = "SKU-123"
            },
            InventoryItem = new JsonObject
            {
                ["sku"] = "SKU-123",
                ["condition"] = "NEW",
                ["product"] = new JsonObject
                {
                    ["title"] = "Desk lamp",
                    ["description"] = "Brass lamp"
                },
                ["availability"] = new JsonObject
                {
                    ["shipToLocationAvailability"] = new JsonObject
                    {
                        ["quantity"] = 1
                    }
                }
            },
            Offers = new JsonObject
            {
                ["offers"] = new JsonArray(
                    new JsonObject
                    {
                        ["offerId"] = "offer-123",
                        ["listingId"] = "276700000001",
                        ["marketplaceId"] = "EBAY_US",
                        ["categoryId"] = "2624",
                        ["pricingSummary"] = new JsonObject
                        {
                            ["price"] = new JsonObject
                            {
                                ["value"] = 25m,
                                ["currency"] = "USD"
                            }
                        },
                        ["availableQuantity"] = 1
                    })
            },
            BulkUpdatePriceQuantityResponse = new JsonObject
            {
                ["responses"] = new JsonArray()
            }
        };
        var service = CreateService(gateway);

        await service.UpdateListingAsync(
            Session(),
            "276700000001",
            new ListingPatchDto(null, null, null, null, null, null, null, null, 27m, "USD", 2, null, null, null, null, null, null, null),
            CancellationToken.None);

        Assert.True(gateway.BulkUpdatePriceQuantityCalled);
        Assert.False(gateway.ReviseInventoryStatusCalled);
    }

    [Fact]
    public async Task GetListingAsync_ParsesStringPriceValuesFromInventoryOffers()
    {
        var gateway = new FakeMarketplaceGateway
        {
            Listing = new JsonObject
            {
                ["sku"] = "CARD-1"
            },
            InventoryItem = new JsonObject
            {
                ["sku"] = "CARD-1",
                ["condition"] = "LIKE_NEW",
                ["product"] = new JsonObject
                {
                    ["title"] = "Trading card",
                    ["description"] = "Pack fresh"
                },
                ["availability"] = new JsonObject
                {
                    ["shipToLocationAvailability"] = new JsonObject
                    {
                        ["quantity"] = 1
                    }
                }
            },
            Offers = new JsonObject
            {
                ["offers"] = new JsonArray(
                    new JsonObject
                    {
                        ["offerId"] = "offer-1",
                        ["listingId"] = "276700000002",
                        ["marketplaceId"] = "EBAY_US",
                        ["categoryId"] = "261328",
                        ["pricingSummary"] = new JsonObject
                        {
                            ["price"] = new JsonObject
                            {
                                ["value"] = "25.50",
                                ["currency"] = "USD"
                            }
                        },
                        ["availableQuantity"] = 1
                    })
            }
        };
        var service = CreateService(gateway);

        var result = await service.GetListingAsync(Session(), "sku:CARD-1", CancellationToken.None);

        Assert.Equal(25.50m, result.Spec.PriceValue);
    }

    [Fact]
    public async Task CreateListingAsync_SendsConditionDescriptorsOnInventoryItem()
    {
        var gateway = new FakeMarketplaceGateway
        {
            CreateOfferResponse = new JsonObject
            {
                ["offerId"] = "offer-123"
            },
            PublishOfferResponse = new JsonObject
            {
                ["listingId"] = "276700000003"
            }
        };
        var service = CreateService(gateway);

        await service.CreateListingAsync(
            Session(),
            new ListingSpecDto(
                "CARD-RAW-1",
                "EBAY_US",
                "1990s trading card",
                "Ungraded card",
                "261328",
                "LIKE_NEW",
                "Near Mint or Better",
                "FIXED_PRICE",
                12.34m,
                "USD",
                1,
                new ListingPoliciesDto("payment-1", "return-1", "fulfillment-1"),
                "warehouse-a",
                null,
                null,
                null,
                [new ListingConditionDescriptorDto("40001", ["400010"])],
                "en-US"),
            CancellationToken.None);

        Assert.NotNull(gateway.LastUpsertInventoryItemPayload);
        Assert.Equal("40001", gateway.LastUpsertInventoryItemPayload!["conditionDescriptors"]?[0]?["name"]?.GetValue<string>());
        Assert.Equal("400010", gateway.LastUpsertInventoryItemPayload!["conditionDescriptors"]?[0]?["values"]?[0]?.GetValue<string>());
    }

    [Fact]
    public async Task CreateListingAsync_RecoversExistingOfferWhenOfferAlreadyExists()
    {
        var gateway = new FakeMarketplaceGateway
        {
            CreateOfferException = new InvalidOperationException("eBay API request failed (409): Offer entity already exists"),
            Offers = new JsonObject
            {
                ["offers"] = new JsonArray(
                    new JsonObject
                    {
                        ["offerId"] = "offer-existing",
                        ["marketplaceId"] = "EBAY_US",
                        ["categoryId"] = "261328",
                        ["status"] = "DRAFT"
                    })
            },
            GetOfferResponse = new JsonObject
            {
                ["offerId"] = "offer-existing",
                ["marketplaceId"] = "EBAY_US",
                ["categoryId"] = "261328",
                ["status"] = "DRAFT"
            },
            PublishOfferResponse = new JsonObject
            {
                ["listingId"] = "276700000004"
            }
        };
        var service = CreateService(gateway);

        var result = await service.CreateListingAsync(
            Session(),
            new ListingSpecDto(
                "CARD-RAW-2",
                "EBAY_US",
                "1990s trading card",
                "Ungraded card",
                "261328",
                "LIKE_NEW",
                "Near Mint or Better",
                "FIXED_PRICE",
                15m,
                "USD",
                1,
                new ListingPoliciesDto("payment-1", "return-1", "fulfillment-1"),
                "warehouse-a",
                null,
                null,
                null,
                [new ListingConditionDescriptorDto("40001", ["400010"])],
                "en-US"),
            CancellationToken.None);

        Assert.True(gateway.UpdateOfferCalled);
        Assert.True(gateway.PublishOfferCalled);
        Assert.Equal("offer-existing", result["offerId"]?.GetValue<string>());
        Assert.True(result["offerRecovered"]?.GetValue<bool>());
    }

    private static LocalEbayStoreService CreateService(IEbayMarketplaceGateway gateway)
    {
        var options = Options.Create(new EbayIntegrationOptions
        {
            Sandbox = new EbayEnvironmentOptions
            {
                ClientId = "sandbox-client",
                ClientSecret = "sandbox-secret",
                RuName = "sandbox-runame"
            },
            Production = new EbayEnvironmentOptions
            {
                ClientId = "production-client",
                ClientSecret = "production-secret",
                RuName = "production-runame"
            }
        });
        return new LocalEbayStoreService(new EbayEnvironmentResolver(options), gateway);
    }

    private static LocalEbaySessionContextDto Session()
        => new("production", "EBAY_US", "access-token", null, null, null, null);

    private static JsonObject BuildLegacyListing()
        => new()
        {
            ["source"] = "TRADING",
            ["marketplaceId"] = "EBAY_US",
            ["listingId"] = "276784478357",
            ["sku"] = null,
            ["status"] = "Active",
            ["title"] = "Legacy listing",
            ["description"] = "Legacy description",
            ["categoryId"] = "261328",
            ["conditionId"] = "4000",
            ["conditionDisplayName"] = "Ungraded",
            ["listingType"] = "FixedPriceItem",
            ["startPrice"] = 250m,
            ["priceCurrency"] = "USD",
            ["quantity"] = 1,
            ["quantityAvailable"] = 1,
            ["pictureUrls"] = new JsonArray("https://i.example.com/1.jpg"),
            ["itemSpecifics"] = new JsonObject
            {
                ["Player/Athlete"] = new JsonArray("Kevin Durant")
            }
        };

    private sealed class FakeMarketplaceGateway : IEbayMarketplaceGateway
    {
        public JsonObject? LegacyListing { get; init; }
        public JsonObject? Listing { get; init; }
        public JsonObject? InventoryItem { get; init; }
        public JsonObject Offers { get; init; } = new() { ["offers"] = new JsonArray() };
        public JsonObject CreateOfferResponse { get; init; } = new();
        public JsonObject GetOfferResponse { get; init; } = new();
        public JsonObject PublishOfferResponse { get; init; } = new();
        public JsonObject ReviseInventoryStatusResponse { get; init; } = new();
        public JsonObject ReviseFixedPriceItemResponse { get; init; } = new();
        public JsonObject EndFixedPriceItemResponse { get; init; } = new();
        public JsonObject BulkUpdatePriceQuantityResponse { get; init; } = new();
        public Exception? CreateOfferException { get; init; }
        public bool ReviseInventoryStatusCalled { get; private set; }
        public bool ReviseFixedPriceItemCalled { get; private set; }
        public bool EndFixedPriceItemCalled { get; private set; }
        public bool BulkUpdatePriceQuantityCalled { get; private set; }
        public bool UpdateOfferCalled { get; private set; }
        public bool PublishOfferCalled { get; private set; }
        public JsonObject? LastReviseFixedPriceItemPayload { get; private set; }
        public JsonObject? LastUpsertInventoryItemPayload { get; private set; }
        public JsonObject? LastUpdateOfferPayload { get; private set; }

        public Task<JsonObject> ExchangeAuthorizationCodeAsync(EbayEnvironmentDescriptor environment, string code, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<JsonObject> RefreshAccessTokenAsync(EbayEnvironmentDescriptor environment, string refreshToken, string[] scopes, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<JsonObject> GetUserAsync(EbayEnvironmentDescriptor environment, string accessToken, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<JsonObject> GetPrivilegesAsync(EbayEnvironmentDescriptor environment, string accessToken, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<JsonObject> GetPaymentPoliciesAsync(EbayEnvironmentDescriptor environment, string accessToken, string marketplaceId, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<JsonObject> GetFulfillmentPoliciesAsync(EbayEnvironmentDescriptor environment, string accessToken, string marketplaceId, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<JsonObject> GetReturnPoliciesAsync(EbayEnvironmentDescriptor environment, string accessToken, string marketplaceId, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task CreatePaymentPolicyAsync(EbayEnvironmentDescriptor environment, string accessToken, JsonObject payload, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task CreateFulfillmentPolicyAsync(EbayEnvironmentDescriptor environment, string accessToken, JsonObject payload, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task CreateReturnPolicyAsync(EbayEnvironmentDescriptor environment, string accessToken, JsonObject payload, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<JsonObject> OptInToProgramAsync(EbayEnvironmentDescriptor environment, string accessToken, string programType, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<JsonObject> GetLocationsAsync(EbayEnvironmentDescriptor environment, string accessToken, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task CreateInventoryLocationAsync(EbayEnvironmentDescriptor environment, string accessToken, string merchantLocationKey, JsonObject payload, string? locale, string? marketplaceId, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task UpdateInventoryLocationAsync(EbayEnvironmentDescriptor environment, string accessToken, string merchantLocationKey, JsonObject payload, string? locale, string? marketplaceId, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<JsonObject> GetInventoryItemsAsync(EbayEnvironmentDescriptor environment, string accessToken, int limit, int offset, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task UpsertInventoryItemAsync(EbayEnvironmentDescriptor environment, string accessToken, string sku, JsonObject payload, string? locale, string? marketplaceId, CancellationToken cancellationToken)
        {
            LastUpsertInventoryItemPayload = payload;
            return Task.CompletedTask;
        }

        public Task<JsonObject> GetOfferAsync(EbayEnvironmentDescriptor environment, string accessToken, string offerId, CancellationToken cancellationToken)
            => Task.FromResult(GetOfferResponse);

        public Task<JsonObject> CreateOfferAsync(EbayEnvironmentDescriptor environment, string accessToken, JsonObject payload, string? locale, string? marketplaceId, CancellationToken cancellationToken)
            => CreateOfferException is null
                ? Task.FromResult(CreateOfferResponse)
                : Task.FromException<JsonObject>(CreateOfferException);

        public Task UpdateOfferAsync(EbayEnvironmentDescriptor environment, string accessToken, string offerId, JsonObject payload, string? locale, string? marketplaceId, CancellationToken cancellationToken)
        {
            UpdateOfferCalled = true;
            LastUpdateOfferPayload = payload;
            return Task.CompletedTask;
        }

        public Task<JsonObject> PublishOfferAsync(EbayEnvironmentDescriptor environment, string accessToken, string offerId, CancellationToken cancellationToken)
        {
            PublishOfferCalled = true;
            return Task.FromResult(PublishOfferResponse);
        }
        public Task WithdrawOfferAsync(EbayEnvironmentDescriptor environment, string accessToken, string offerId, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<JsonObject> CreateImageFromUrlAsync(EbayEnvironmentDescriptor environment, string accessToken, string sourceUrl, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<JsonObject> CreateImageFromFileAsync(EbayEnvironmentDescriptor environment, string accessToken, byte[] content, string fileName, string contentType, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<IReadOnlyList<JsonObject>> GetActiveListingsAsync(EbayEnvironmentDescriptor environment, string accessToken, string marketplaceId, int pageNumber, int entriesPerPage, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<IReadOnlyList<JsonObject>> GetSoldListingsAsync(EbayEnvironmentDescriptor environment, string accessToken, string marketplaceId, int durationInDays, int pageNumber, int entriesPerPage, CancellationToken cancellationToken) => throw new NotSupportedException();

        public Task<JsonObject> GetInventoryItemAsync(EbayEnvironmentDescriptor environment, string accessToken, string sku, CancellationToken cancellationToken)
            => Task.FromResult(InventoryItem ?? throw new InvalidOperationException("Inventory item not found."));

        public Task<JsonObject> GetOffersAsync(EbayEnvironmentDescriptor environment, string accessToken, string? sku, CancellationToken cancellationToken)
            => Task.FromResult(Offers);

        public Task<JsonObject> BulkUpdatePriceQuantityAsync(EbayEnvironmentDescriptor environment, string accessToken, JsonObject payload, CancellationToken cancellationToken)
        {
            BulkUpdatePriceQuantityCalled = true;
            return Task.FromResult(BulkUpdatePriceQuantityResponse);
        }

        public Task<JsonObject> GetListingAsync(EbayEnvironmentDescriptor environment, string accessToken, string listingId, CancellationToken cancellationToken)
            => Listing is not null
                ? Task.FromResult(Listing)
                : Task.FromException<JsonObject>(new InvalidOperationException("Listing not found."));

        public Task<JsonObject> GetLegacyListingAsync(EbayEnvironmentDescriptor environment, string accessToken, string marketplaceId, string listingId, CancellationToken cancellationToken)
            => LegacyListing is not null
                ? Task.FromResult(LegacyListing)
                : Task.FromException<JsonObject>(new InvalidOperationException("Legacy listing not found."));

        public Task<JsonObject> ReviseInventoryStatusAsync(EbayEnvironmentDescriptor environment, string accessToken, string marketplaceId, string listingId, string? sku, decimal? priceValue, string? priceCurrency, int? quantity, CancellationToken cancellationToken)
        {
            ReviseInventoryStatusCalled = true;
            return Task.FromResult(ReviseInventoryStatusResponse);
        }

        public Task<JsonObject> ReviseFixedPriceItemAsync(EbayEnvironmentDescriptor environment, string accessToken, string marketplaceId, JsonObject payload, CancellationToken cancellationToken)
        {
            ReviseFixedPriceItemCalled = true;
            LastReviseFixedPriceItemPayload = payload;
            return Task.FromResult(ReviseFixedPriceItemResponse);
        }

        public Task<JsonObject> EndFixedPriceItemAsync(EbayEnvironmentDescriptor environment, string accessToken, string marketplaceId, string listingId, string endingReason, CancellationToken cancellationToken)
        {
            EndFixedPriceItemCalled = true;
            return Task.FromResult(EndFixedPriceItemResponse);
        }
    }
}
