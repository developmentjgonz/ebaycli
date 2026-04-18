using System.Text.Json;
using System.Text.Json.Nodes;
using System.Globalization;
using EbayStoreManager.Api.Contracts;
using EbayStoreManager.Api.Domain;

namespace EbayStoreManager.Api.Services;

public sealed class LocalEbayStoreService(
    EbayEnvironmentResolver environmentResolver,
    IEbayMarketplaceGateway gateway)
{
    public async Task<EbayConnectionResponse> GetStatusAsync(LocalEbaySessionContextDto session, CancellationToken cancellationToken)
    {
        var environment = environmentResolver.Resolve(session.Environment);
        var user = await gateway.GetUserAsync(environment, session.AccessToken, cancellationToken);
        var privileges = await gateway.GetPrivilegesAsync(environment, session.AccessToken, cancellationToken);
        return new EbayConnectionResponse(
            "local",
            true,
            environment.Name,
            session.MarketplaceId,
            user["userId"]?.GetValue<string>(),
            user["username"]?.GetValue<string>(),
            user["accountType"]?.GetValue<string>(),
            privileges["sellerRegistrationCompleted"]?.GetValue<bool?>(),
            null,
            null,
            null);
    }

    public async Task<DoctorReportDto> RunDoctorAsync(LocalEbaySessionContextDto session, CancellationToken cancellationToken)
    {
        var environment = environmentResolver.Resolve(session.Environment);
        var checks = new List<DoctorCheckDto>
        {
            new("connection", true, "Connected to eBay.", new { session.MarketplaceId })
        };

        try
        {
            var privileges = await gateway.GetPrivilegesAsync(environment, session.AccessToken, cancellationToken);
            checks.Add(new DoctorCheckDto(
                "sellerPrivileges",
                privileges["sellerRegistrationCompleted"]?.GetValue<bool?>() == true,
                privileges["sellerRegistrationCompleted"]?.GetValue<bool?>() == true
                    ? "Seller registration is complete."
                    : "Seller registration is incomplete or unavailable.",
                privileges));
        }
        catch (Exception exception)
        {
            checks.Add(BuildDoctorFailureCheck("sellerPrivileges", "Seller privileges could not be checked.", exception));
        }

        JsonObject? paymentPolicies = null;
        JsonObject? fulfillmentPolicies = null;
        JsonObject? returnPolicies = null;
        try
        {
            paymentPolicies = await gateway.GetPaymentPoliciesAsync(environment, session.AccessToken, session.MarketplaceId, cancellationToken);
            fulfillmentPolicies = await gateway.GetFulfillmentPoliciesAsync(environment, session.AccessToken, session.MarketplaceId, cancellationToken);
            returnPolicies = await gateway.GetReturnPoliciesAsync(environment, session.AccessToken, session.MarketplaceId, cancellationToken);
        }
        catch (Exception exception) when (DoctorErrorInterpreter.TryBuildBusinessPolicyChecks(exception, out var businessPolicyChecks))
        {
            checks.AddRange(businessPolicyChecks);
        }

        JsonObject? locations = null;
        try
        {
            locations = await gateway.GetLocationsAsync(environment, session.AccessToken, cancellationToken);
        }
        catch (Exception exception)
        {
            checks.Add(BuildDoctorFailureCheck("inventoryLocations", "Inventory locations could not be checked.", exception));
        }

        if (paymentPolicies is not null && fulfillmentPolicies is not null && returnPolicies is not null)
        {
            checks.Add(new DoctorCheckDto("paymentPolicies", ReadArray(paymentPolicies, "paymentPolicies").Count > 0, "Payment policies checked.", paymentPolicies));
            checks.Add(new DoctorCheckDto("fulfillmentPolicies", ReadArray(fulfillmentPolicies, "fulfillmentPolicies").Count > 0, "Fulfillment policies checked.", fulfillmentPolicies));
            checks.Add(new DoctorCheckDto("returnPolicies", ReadArray(returnPolicies, "returnPolicies").Count > 0, "Return policies checked.", returnPolicies));
        }

        if (locations is not null)
        {
            checks.Add(new DoctorCheckDto("inventoryLocations", ReadArray(locations, "locations").Count > 0, "Inventory locations checked.", locations));
        }

        return new DoctorReportDto("local", session.Environment, checks);
    }

    public async Task<JsonObject> SyncPoliciesAsync(LocalEbaySessionContextDto session, LocalPolicySyncRequest request, CancellationToken cancellationToken)
    {
        var environment = environmentResolver.Resolve(session.Environment);
        if (request.CreatePayload.HasValue && request.CreatePayload.Value.ValueKind == JsonValueKind.Object)
        {
            var payload = JsonNode.Parse(request.CreatePayload.Value.GetRawText())?.AsObject() ?? new JsonObject();
            if (payload["paymentPolicy"] is JsonObject paymentPolicy)
            {
                await gateway.CreatePaymentPolicyAsync(environment, session.AccessToken, paymentPolicy, cancellationToken);
            }
            if (payload["fulfillmentPolicy"] is JsonObject fulfillmentPolicy)
            {
                await gateway.CreateFulfillmentPolicyAsync(environment, session.AccessToken, fulfillmentPolicy, cancellationToken);
            }
            if (payload["returnPolicy"] is JsonObject returnPolicy)
            {
                await gateway.CreateReturnPolicyAsync(environment, session.AccessToken, returnPolicy, cancellationToken);
            }
        }

        var paymentPolicies = await gateway.GetPaymentPoliciesAsync(environment, session.AccessToken, session.MarketplaceId, cancellationToken);
        var fulfillmentPolicies = await gateway.GetFulfillmentPoliciesAsync(environment, session.AccessToken, session.MarketplaceId, cancellationToken);
        var returnPolicies = await gateway.GetReturnPoliciesAsync(environment, session.AccessToken, session.MarketplaceId, cancellationToken);

        var defaults = new JsonObject
        {
            ["paymentPolicyId"] = request.PaymentPolicyId ?? InferSingleId(paymentPolicies, "paymentPolicies", "paymentPolicyId"),
            ["fulfillmentPolicyId"] = request.FulfillmentPolicyId ?? InferSingleId(fulfillmentPolicies, "fulfillmentPolicies", "fulfillmentPolicyId"),
            ["returnPolicyId"] = request.ReturnPolicyId ?? InferSingleId(returnPolicies, "returnPolicies", "returnPolicyId")
        };

        return new JsonObject
        {
            ["paymentPolicies"] = paymentPolicies,
            ["fulfillmentPolicies"] = fulfillmentPolicies,
            ["returnPolicies"] = returnPolicies,
            ["defaults"] = defaults
        };
    }

    public async Task<JsonObject> OptInToPolicyProgramAsync(LocalEbaySessionContextDto session, string programType, CancellationToken cancellationToken)
    {
        var environment = environmentResolver.Resolve(session.Environment);
        var result = await gateway.OptInToProgramAsync(environment, session.AccessToken, programType, cancellationToken);
        return new JsonObject
        {
            ["programType"] = programType,
            ["result"] = result
        };
    }

    public async Task<JsonObject> UpsertLocationAsync(LocalEbaySessionContextDto session, LocalLocationUpsertRequest request, CancellationToken cancellationToken)
    {
        var environment = environmentResolver.Resolve(session.Environment);
        if (!request.LocationPayload.HasValue || request.LocationPayload.Value.ValueKind != JsonValueKind.Object)
        {
            return new JsonObject { ["merchantLocationKey"] = request.MerchantLocationKey };
        }

        var payload = JsonNode.Parse(request.LocationPayload.Value.GetRawText())?.AsObject() ?? new JsonObject();
        var merchantLocationKey = request.MerchantLocationKey ??
                                  payload["merchantLocationKey"]?.GetValue<string>() ??
                                  throw new InvalidOperationException("merchantLocationKey is required.");
        try
        {
            await gateway.CreateInventoryLocationAsync(environment, session.AccessToken, merchantLocationKey, payload, "en-US", session.MarketplaceId, cancellationToken);
        }
        catch
        {
            await gateway.UpdateInventoryLocationAsync(environment, session.AccessToken, merchantLocationKey, payload, "en-US", session.MarketplaceId, cancellationToken);
        }

        return new JsonObject
        {
            ["merchantLocationKey"] = merchantLocationKey,
            ["payload"] = payload
        };
    }

    public async Task<IReadOnlyList<ListingSummaryDto>> ListListingsAsync(
        LocalEbaySessionContextDto session,
        string? status,
        int? page,
        int? limit,
        int? days,
        CancellationToken cancellationToken)
    {
        var environment = environmentResolver.Resolve(session.Environment);
        var effectivePage = page.GetValueOrDefault(1);
        var effectiveLimit = Math.Clamp(limit.GetValueOrDefault(100), 1, 200);
        if (string.IsNullOrWhiteSpace(status) || string.Equals(status, "ACTIVE", StringComparison.OrdinalIgnoreCase))
        {
            var activeListings = await gateway.GetActiveListingsAsync(environment, session.AccessToken, session.MarketplaceId, effectivePage, effectiveLimit, cancellationToken);
            return activeListings.Select(item => new ListingSummaryDto(
                item["sku"]?.GetValue<string>() ?? string.Empty,
                item["marketplaceId"]?.GetValue<string>() ?? session.MarketplaceId,
                item["offerId"]?.GetValue<string>(),
                item["listingId"]?.GetValue<string>(),
                item["status"]?.GetValue<string>(),
                item["title"]?.GetValue<string>(),
                ReadDecimal(item["priceValue"]),
                item["priceCurrency"]?.GetValue<string>(),
                ReadInt(item["availableQuantity"]),
                ReadInt(item["quantitySold"]),
                ParseDateTimeOffset(item["soldAtUtc"]?.GetValue<string>()),
                item["buyerUsername"]?.GetValue<string>(),
                item["source"]?.GetValue<string>(),
                item["listingUrl"]?.GetValue<string>())).ToList();
        }

        if (string.Equals(status, "SOLD", StringComparison.OrdinalIgnoreCase))
        {
            var soldListings = await gateway.GetSoldListingsAsync(environment, session.AccessToken, session.MarketplaceId, Math.Clamp(days.GetValueOrDefault(30), 1, 60), effectivePage, effectiveLimit, cancellationToken);
            return soldListings.Select(item => new ListingSummaryDto(
                item["sku"]?.GetValue<string>() ?? item["listingId"]?.GetValue<string>() ?? string.Empty,
                item["marketplaceId"]?.GetValue<string>() ?? session.MarketplaceId,
                item["offerId"]?.GetValue<string>(),
                item["listingId"]?.GetValue<string>(),
                item["status"]?.GetValue<string>(),
                item["title"]?.GetValue<string>(),
                ReadDecimal(item["priceValue"]),
                item["priceCurrency"]?.GetValue<string>(),
                ReadInt(item["availableQuantity"]),
                ReadInt(item["quantitySold"]),
                ParseDateTimeOffset(item["soldAtUtc"]?.GetValue<string>()),
                item["buyerUsername"]?.GetValue<string>(),
                item["source"]?.GetValue<string>(),
                item["listingUrl"]?.GetValue<string>())).ToList();
        }

        var results = new List<ListingSummaryDto>();
        var offset = 0;
        while (true)
        {
            var inventoryPage = await gateway.GetInventoryItemsAsync(environment, session.AccessToken, 100, offset, cancellationToken);
            var inventoryItems = ReadArray(inventoryPage, "inventoryItems");
            if (inventoryItems.Count == 0)
            {
                break;
            }

            foreach (var inventoryItem in inventoryItems)
            {
                var sku = inventoryItem["sku"]?.GetValue<string>();
                if (string.IsNullOrWhiteSpace(sku))
                {
                    continue;
                }

                var offers = await gateway.GetOffersAsync(environment, session.AccessToken, sku, cancellationToken);
                foreach (var offer in ReadArray(offers, "offers"))
                {
                    if (!string.IsNullOrWhiteSpace(status) &&
                        !string.Equals(offer["status"]?.GetValue<string>(), status, StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }

                    results.Add(new ListingSummaryDto(
                        sku,
                        offer["marketplaceId"]?.GetValue<string>() ?? session.MarketplaceId,
                        offer["offerId"]?.GetValue<string>(),
                        offer["listingId"]?.GetValue<string>(),
                        offer["status"]?.GetValue<string>(),
                        inventoryItem["product"]?["title"]?.GetValue<string>(),
                        ReadDecimal(offer["pricingSummary"]?["price"]?["value"]),
                        offer["pricingSummary"]?["price"]?["currency"]?.GetValue<string>(),
                        ReadInt(inventoryItem["availability"]?["shipToLocationAvailability"]?["quantity"]),
                        null,
                        null,
                        null,
                        "INVENTORY",
                        null));
                }
            }

            offset += inventoryItems.Count;
            if (inventoryItems.Count < 100)
            {
                break;
            }
        }

        return results;
    }

    public async Task<ListingAggregateDto> GetListingAsync(LocalEbaySessionContextDto session, string reference, CancellationToken cancellationToken)
    {
        var aggregate = await ResolveAggregateAsync(session, reference, cancellationToken);
        return new ListingAggregateDto(new
        {
            aggregate.Sku,
            aggregate.MarketplaceId,
            InventoryItem = aggregate.InventoryItem,
            Offer = aggregate.Offer,
            Listing = aggregate.Listing,
            LegacyItem = aggregate.LegacyItem,
            Source = aggregate.LegacyItem is not null ? "TRADING" : "INVENTORY"
        }, ToListingSpec(aggregate, session.MarketplaceId));
    }

    public Task<MutationPlanDto> PlanCreateAsync(LocalEbaySessionContextDto session, ListingSpecDto request, CancellationToken cancellationToken)
    {
        ValidateCreateRequest(request);
        return Task.FromResult(BuildCreatePlan(session, request));
    }

    public async Task<JsonObject> CreateListingAsync(LocalEbaySessionContextDto session, ListingSpecDto request, CancellationToken cancellationToken)
    {
        ValidateCreateRequest(request);
        var environment = environmentResolver.Resolve(session.Environment);
        var uploadedImages = await UploadImagesAsync(environment, session.AccessToken, request.Images ?? [], cancellationToken);
        var effectiveMarketplaceId = request.MarketplaceId ?? session.MarketplaceId;
        var inventoryPayload = BuildInventoryPayload(request, uploadedImages);
        var offerPayload = BuildOfferPayload(session, request);
        await gateway.UpsertInventoryItemAsync(environment, session.AccessToken, request.Sku, inventoryPayload, request.Locale, effectiveMarketplaceId, cancellationToken);

        JsonObject offer;
        var offerRecovered = false;
        string? recoveryMessage = null;
        try
        {
            offer = await gateway.CreateOfferAsync(environment, session.AccessToken, offerPayload, request.Locale, effectiveMarketplaceId, cancellationToken);
        }
        catch (InvalidOperationException exception) when (IsAlreadyExistingOfferError(exception))
        {
            offer = await RecoverExistingOfferAsync(environment, session, request, offerPayload, effectiveMarketplaceId, cancellationToken)
                ?? throw new InvalidOperationException($"eBay reported that an offer already exists for SKU '{request.Sku}', but no matching offer could be resolved.", exception);
            offerRecovered = true;
            recoveryMessage = "Recovered an existing offer after eBay reported `Offer entity already exists`.";
        }

        var offerId = offer["offerId"]?.GetValue<string>() ?? throw new InvalidOperationException("eBay did not return an offerId.");
        var listingId = offer["listingId"]?.GetValue<string>();
        JsonObject? publish = null;
        if (string.IsNullOrWhiteSpace(listingId))
        {
            publish = await gateway.PublishOfferAsync(environment, session.AccessToken, offerId, cancellationToken);
            listingId = publish["listingId"]?.GetValue<string>();
        }

        return new JsonObject
        {
            ["sku"] = request.Sku,
            ["offerId"] = offerId,
            ["listingId"] = listingId,
            ["offerRecovered"] = offerRecovered,
            ["message"] = recoveryMessage,
            ["publish"] = publish
        };
    }

    public async Task<MutationPlanDto> PlanUpdateAsync(LocalEbaySessionContextDto session, string reference, ListingPatchDto request, CancellationToken cancellationToken)
    {
        var aggregate = await ResolveAggregateAsync(session, reference, cancellationToken);
        var current = ToListingSpec(aggregate, session.MarketplaceId);
        return BuildUpdatePlan(session, aggregate, current, request);
    }

    public async Task<JsonObject> UpdateListingAsync(LocalEbaySessionContextDto session, string reference, ListingPatchDto request, CancellationToken cancellationToken)
    {
        var aggregate = await ResolveAggregateAsync(session, reference, cancellationToken);
        var current = ToListingSpec(aggregate, session.MarketplaceId);
        var merged = Merge(current, request);
        ValidateCreateRequest(merged);

        var environment = environmentResolver.Resolve(session.Environment);
        if (aggregate.LegacyItem is not null)
        {
            if (IsPriceQuantityOnly(request))
            {
                var result = await gateway.ReviseInventoryStatusAsync(
                    environment,
                    session.AccessToken,
                    aggregate.MarketplaceId,
                    aggregate.LegacyItem["listingId"]?.GetValue<string>() ?? throw new InvalidOperationException("No listingId found for legacy listing."),
                    aggregate.LegacyItem["sku"]?.GetValue<string>() ?? aggregate.Sku,
                    request.PriceValue ?? merged.PriceValue,
                    request.PriceCurrency ?? merged.PriceCurrency ?? "USD",
                    request.AvailableQuantity ?? merged.AvailableQuantity,
                    cancellationToken);

                return new JsonObject
                {
                    ["sku"] = aggregate.Sku,
                    ["listingId"] = aggregate.LegacyItem["listingId"]?.GetValue<string>(),
                    ["source"] = "TRADING",
                    ["result"] = result
                };
            }

            var legacyImages = request.Images is null
                ? ((aggregate.LegacyItem["pictureUrls"] as JsonArray)?.Select(x => x?.GetValue<string>() ?? string.Empty).Where(x => !string.IsNullOrWhiteSpace(x)).ToList() ?? [])
                : await UploadImagesAsync(environment, session.AccessToken, request.Images, cancellationToken);

            var revisePayload = BuildLegacyRevisePayload(aggregate, merged, legacyImages);
            var reviseResult = await gateway.ReviseFixedPriceItemAsync(
                environment,
                session.AccessToken,
                aggregate.MarketplaceId,
                revisePayload,
                cancellationToken);

            return new JsonObject
            {
                ["sku"] = aggregate.Sku,
                ["listingId"] = aggregate.LegacyItem["listingId"]?.GetValue<string>(),
                ["source"] = "TRADING",
                ["result"] = reviseResult
            };
        }

        var offerId = aggregate.Offer?["offerId"]?.GetValue<string>() ?? throw new InvalidOperationException("No offer found for listing.");
        if (IsPriceQuantityOnly(request))
        {
            var payload = new JsonObject
            {
                ["requests"] = new JsonArray(
                    new JsonObject
                    {
                        ["sku"] = aggregate.Sku,
                        ["shipToLocationAvailability"] = new JsonObject
                        {
                            ["quantity"] = merged.AvailableQuantity
                        },
                        ["offers"] = new JsonArray(
                            new JsonObject
                            {
                                ["offerId"] = offerId,
                                ["availableQuantity"] = merged.AvailableQuantity,
                                ["price"] = new JsonObject
                                {
                                    ["value"] = merged.PriceValue,
                                    ["currency"] = merged.PriceCurrency ?? "USD"
                                }
                            })
                    })
            };

            return await gateway.BulkUpdatePriceQuantityAsync(environment, session.AccessToken, payload, cancellationToken);
        }

        var images = request.Images is null
            ? ((aggregate.InventoryItem?["product"]?["imageUrls"] as JsonArray)?.Select(x => x?.GetValue<string>() ?? string.Empty).Where(x => !string.IsNullOrWhiteSpace(x)).ToList() ?? [])
            : await UploadImagesAsync(environment, session.AccessToken, request.Images, cancellationToken);

        var effectiveMarketplaceId = merged.MarketplaceId ?? session.MarketplaceId;
        await gateway.UpsertInventoryItemAsync(environment, session.AccessToken, aggregate.Sku, BuildInventoryPayload(merged, images), merged.Locale, effectiveMarketplaceId, cancellationToken);
        await gateway.UpdateOfferAsync(environment, session.AccessToken, offerId, BuildOfferPayload(session, merged), merged.Locale, effectiveMarketplaceId, cancellationToken);

        return new JsonObject
        {
            ["sku"] = aggregate.Sku,
            ["offerId"] = offerId,
            ["updated"] = true
        };
    }

    public async Task<MutationPlanDto> PlanEndAsync(LocalEbaySessionContextDto session, string reference, CancellationToken cancellationToken)
    {
        var aggregate = await ResolveAggregateAsync(session, reference, cancellationToken);
        if (aggregate.LegacyItem is not null)
        {
            return new MutationPlanDto(
                "end",
                session.Environment,
                "local",
                aggregate.MarketplaceId,
                new
                {
                    aggregate.Sku,
                    ListingId = aggregate.LegacyItem["listingId"]?.GetValue<string>()
                },
                [new MutationActionDto("endFixedPriceItem", $"End listing {aggregate.LegacyItem["listingId"]?.GetValue<string>()}", new
                {
                    ListingId = aggregate.LegacyItem["listingId"]?.GetValue<string>(),
                    EndingReason = "NotAvailable"
                })],
                []);
        }

        return new MutationPlanDto(
            "end",
            session.Environment,
            "local",
            aggregate.MarketplaceId,
            new
            {
                aggregate.Sku,
                OfferId = aggregate.Offer?["offerId"]?.GetValue<string>(),
                ListingId = aggregate.Offer?["listingId"]?.GetValue<string>()
            },
            [new MutationActionDto("withdrawOffer", $"Withdraw offer {aggregate.Offer?["offerId"]?.GetValue<string>()}", null)],
            []);
    }

    public async Task<JsonObject> EndListingAsync(LocalEbaySessionContextDto session, string reference, CancellationToken cancellationToken)
    {
        var aggregate = await ResolveAggregateAsync(session, reference, cancellationToken);
        var environment = environmentResolver.Resolve(session.Environment);
        if (aggregate.LegacyItem is not null)
        {
            var result = await gateway.EndFixedPriceItemAsync(
                environment,
                session.AccessToken,
                aggregate.MarketplaceId,
                aggregate.LegacyItem["listingId"]?.GetValue<string>() ?? throw new InvalidOperationException("No listingId found for legacy listing."),
                "NotAvailable",
                cancellationToken);

            return new JsonObject
            {
                ["sku"] = aggregate.Sku,
                ["listingId"] = aggregate.LegacyItem["listingId"]?.GetValue<string>(),
                ["source"] = "TRADING",
                ["result"] = result
            };
        }

        var offerId = aggregate.Offer?["offerId"]?.GetValue<string>() ?? throw new InvalidOperationException("No offer found for listing.");
        await gateway.WithdrawOfferAsync(environment, session.AccessToken, offerId, cancellationToken);
        return new JsonObject
        {
            ["sku"] = aggregate.Sku,
            ["offerId"] = offerId,
            ["withdrawn"] = true
        };
    }

    private async Task<List<string>> UploadImagesAsync(
        EbayEnvironmentDescriptor environment,
        string accessToken,
        IReadOnlyList<ListingImageDto> images,
        CancellationToken cancellationToken)
    {
        var uploaded = new List<string>();
        foreach (var image in images)
        {
            JsonObject response;
            if (!string.IsNullOrWhiteSpace(image.Url))
            {
                response = await gateway.CreateImageFromUrlAsync(environment, accessToken, image.Url, cancellationToken);
            }
            else if (!string.IsNullOrWhiteSpace(image.Base64Content))
            {
                var bytes = Convert.FromBase64String(image.Base64Content);
                response = await gateway.CreateImageFromFileAsync(environment, accessToken, bytes, image.FileName ?? "image.bin", image.ContentType ?? "application/octet-stream", cancellationToken);
            }
            else
            {
                throw new InvalidOperationException("Each image must include either Url or Base64Content.");
            }

            var imageUrl = response["imageUrl"]?.GetValue<string>();
            if (string.IsNullOrWhiteSpace(imageUrl))
            {
                throw new InvalidOperationException("eBay media upload did not return an imageUrl.");
            }

            uploaded.Add(imageUrl);
        }

        return uploaded;
    }

    private async Task<ListingAggregate> ResolveAggregateAsync(LocalEbaySessionContextDto session, string reference, CancellationToken cancellationToken)
    {
        var environment = environmentResolver.Resolve(session.Environment);
        var parsed = ParseReference(reference);

        if (parsed.Kind == "sku")
        {
            JsonObject? inventoryItem = null;
            try { inventoryItem = await gateway.GetInventoryItemAsync(environment, session.AccessToken, parsed.Value, cancellationToken); } catch { }
            var offers = await gateway.GetOffersAsync(environment, session.AccessToken, parsed.Value, cancellationToken);
            var offer = ReadArray(offers, "offers").FirstOrDefault();
            JsonObject? listing = null;
            if (offer?["listingId"]?.GetValue<string>() is { Length: > 0 } listingId)
            {
                listing = await gateway.GetListingAsync(environment, session.AccessToken, listingId, cancellationToken);
            }

            if (inventoryItem is null && offer is null)
            {
                throw new InvalidOperationException($"No listing found for reference '{reference}'.");
            }

            return new ListingAggregate(parsed.Value, offer?["marketplaceId"]?.GetValue<string>() ?? session.MarketplaceId, inventoryItem, offer, listing, null);
        }

        if (parsed.Kind == "offer")
        {
            var offer = await gateway.GetOfferAsync(environment, session.AccessToken, parsed.Value, cancellationToken);
            var sku = offer["sku"]?.GetValue<string>() ?? throw new InvalidOperationException("Offer response did not include sku.");
            var inventoryItem = await gateway.GetInventoryItemAsync(environment, session.AccessToken, sku, cancellationToken);
            JsonObject? listing = null;
            if (offer["listingId"]?.GetValue<string>() is { Length: > 0 } listingId)
            {
                listing = await gateway.GetListingAsync(environment, session.AccessToken, listingId, cancellationToken);
            }
            return new ListingAggregate(sku, offer["marketplaceId"]?.GetValue<string>() ?? session.MarketplaceId, inventoryItem, offer, listing, null);
        }

        try
        {
            var listingById = await gateway.GetListingAsync(environment, session.AccessToken, parsed.Value, cancellationToken);
            var listingSku = listingById["sku"]?.GetValue<string>() ?? throw new InvalidOperationException("Listing response did not include sku.");
            var itemByListing = await gateway.GetInventoryItemAsync(environment, session.AccessToken, listingSku, cancellationToken);
            var offersBySku = await gateway.GetOffersAsync(environment, session.AccessToken, listingSku, cancellationToken);
            var matchingOffer = ReadArray(offersBySku, "offers").FirstOrDefault(x => x["listingId"]?.GetValue<string>() == parsed.Value)
                                ?? ReadArray(offersBySku, "offers").FirstOrDefault();
            return new ListingAggregate(listingSku, matchingOffer?["marketplaceId"]?.GetValue<string>() ?? session.MarketplaceId, itemByListing, matchingOffer, listingById, null);
        }
        catch
        {
            var legacyItem = await gateway.GetLegacyListingAsync(environment, session.AccessToken, session.MarketplaceId, parsed.Value, cancellationToken);
            var legacySku = legacyItem["sku"]?.GetValue<string>() ?? parsed.Value;
            return new ListingAggregate(legacySku, legacyItem["marketplaceId"]?.GetValue<string>() ?? session.MarketplaceId, null, null, null, legacyItem);
        }
    }

    private static (string Kind, string Value) ParseReference(string reference)
    {
        if (reference.StartsWith("sku:", StringComparison.OrdinalIgnoreCase)) return ("sku", reference[4..]);
        if (reference.StartsWith("offer:", StringComparison.OrdinalIgnoreCase)) return ("offer", reference[6..]);
        if (reference.StartsWith("listing:", StringComparison.OrdinalIgnoreCase)) return ("listing", reference[8..]);
        if (reference.All(char.IsDigit) && reference.Length >= 9) return ("listing", reference);
        return ("sku", reference);
    }

    private static MutationPlanDto BuildCreatePlan(LocalEbaySessionContextDto session, ListingSpecDto request)
    {
        var actions = new List<MutationActionDto>();
        foreach (var image in request.Images ?? [])
        {
            actions.Add(new MutationActionDto("uploadImage", !string.IsNullOrWhiteSpace(image.Url) ? $"Upload image from {image.Url}" : $"Upload inline image {image.FileName}", image));
        }

        actions.Add(new MutationActionDto("createInventoryItem", $"Create or replace inventory item {request.Sku}", new { request.Sku, request.AvailableQuantity, request.Title }));
        actions.Add(new MutationActionDto("createOffer", $"Create offer for {request.Sku}", new
        {
            request.Sku,
            MarketplaceId = request.MarketplaceId ?? session.MarketplaceId,
            request.PriceValue,
            Currency = request.PriceCurrency ?? "USD"
        }));
        actions.Add(new MutationActionDto("publishOffer", $"Publish offer for {request.Sku}", null));

        return new MutationPlanDto("create", session.Environment, "local", request.MarketplaceId ?? session.MarketplaceId, new { request.Sku }, actions, []);
    }

    private static MutationPlanDto BuildUpdatePlan(LocalEbaySessionContextDto session, ListingAggregate aggregate, ListingSpecDto current, ListingPatchDto patch)
    {
        var merged = Merge(current, patch);
        var actions = new List<MutationActionDto>();
        if (patch.Images is not null)
        {
            foreach (var image in patch.Images)
            {
                actions.Add(new MutationActionDto("uploadImage", $"Upload {(image.Url ?? image.FileName ?? "image")}", image));
            }
        }

        if (aggregate.LegacyItem is not null)
        {
            if (IsPriceQuantityOnly(patch))
            {
                actions.Add(new MutationActionDto("reviseInventoryStatus", $"Update price/quantity for legacy listing {aggregate.LegacyItem["listingId"]?.GetValue<string>()}", new
                {
                    aggregate.Sku,
                    ListingId = aggregate.LegacyItem["listingId"]?.GetValue<string>(),
                    merged.PriceValue,
                    merged.AvailableQuantity
                }));
            }
            else
            {
                actions.Add(new MutationActionDto("reviseFixedPriceItem", $"Revise legacy listing {aggregate.LegacyItem["listingId"]?.GetValue<string>()}", new
                {
                    aggregate.Sku,
                    ListingId = aggregate.LegacyItem["listingId"]?.GetValue<string>(),
                    merged.Title,
                    merged.PriceValue
                }));
            }
        }
        else if (IsPriceQuantityOnly(patch))
        {
            actions.Add(new MutationActionDto("bulkUpdatePriceQuantity", $"Update price/quantity for {aggregate.Sku}", new
            {
                aggregate.Sku,
                OfferId = aggregate.Offer?["offerId"]?.GetValue<string>(),
                merged.PriceValue,
                merged.AvailableQuantity
            }));
        }
        else
        {
            actions.Add(new MutationActionDto("replaceInventoryItem", $"Replace inventory item {aggregate.Sku}", new { aggregate.Sku }));
            actions.Add(new MutationActionDto("updateOffer", $"Update offer {aggregate.Offer?["offerId"]?.GetValue<string>()}", new { aggregate.Sku }));
        }

        return new MutationPlanDto("update", session.Environment, "local", aggregate.MarketplaceId, new
        {
            aggregate.Sku,
            OfferId = aggregate.Offer?["offerId"]?.GetValue<string>(),
            ListingId = aggregate.Offer?["listingId"]?.GetValue<string>() ?? aggregate.LegacyItem?["listingId"]?.GetValue<string>(),
            Source = aggregate.LegacyItem is not null ? "TRADING" : "INVENTORY"
        }, actions, []);
    }

    private static bool IsPriceQuantityOnly(ListingPatchDto patch)
        => patch is
        {
            Title: null,
            Description: null,
            CategoryId: null,
            Condition: null,
            ConditionDescription: null,
            Format: null,
            Policies: null,
            LocationKey: null,
            Images: null,
            Aspects: null,
            PackageWeightAndSize: null,
            ConditionDescriptors: null,
            Locale: null,
            MarketplaceId: null,
            Sku: null
        } && (patch.PriceValue.HasValue || patch.AvailableQuantity.HasValue || !string.IsNullOrWhiteSpace(patch.PriceCurrency));

    private static void ValidateCreateRequest(ListingSpecDto request)
    {
        if (string.IsNullOrWhiteSpace(request.Sku) || string.IsNullOrWhiteSpace(request.Title) || string.IsNullOrWhiteSpace(request.Description) || string.IsNullOrWhiteSpace(request.CategoryId) || string.IsNullOrWhiteSpace(request.Condition))
        {
            throw new InvalidOperationException("Listing requests require sku, title, description, categoryId, and condition.");
        }

        if (request.PriceValue <= 0) throw new InvalidOperationException("Listing price must be greater than zero.");
        if (request.AvailableQuantity < 0) throw new InvalidOperationException("Available quantity must be zero or greater.");
        if (request.ConditionDescriptors is not null)
        {
            foreach (var descriptor in request.ConditionDescriptors)
            {
                if (string.IsNullOrWhiteSpace(descriptor.Name))
                {
                    throw new InvalidOperationException("Each condition descriptor requires a name.");
                }

                if (descriptor.Values.Count == 0 || descriptor.Values.Any(string.IsNullOrWhiteSpace))
                {
                    throw new InvalidOperationException($"Condition descriptor '{descriptor.Name}' requires one or more non-empty values.");
                }
            }
        }
    }

    private static ListingSpecDto ToListingSpec(ListingAggregate aggregate, string fallbackMarketplaceId)
    {
        if (aggregate.LegacyItem is not null)
        {
            var legacyImages = (aggregate.LegacyItem["pictureUrls"] as JsonArray)?.Select(x => new ListingImageDto(x?.GetValue<string>(), null, null, null)).ToList() ?? [];
            var legacyAspects = new Dictionary<string, IReadOnlyList<string>>();
            if (aggregate.LegacyItem["itemSpecifics"] is JsonObject specifics)
            {
                foreach (var kvp in specifics)
                {
                    if (kvp.Value is JsonArray values)
                    {
                        legacyAspects[kvp.Key] = values.Select(x => x?.GetValue<string>() ?? string.Empty).Where(x => !string.IsNullOrWhiteSpace(x)).ToArray();
                    }
                }
            }

            return new ListingSpecDto(
                aggregate.Sku,
                aggregate.LegacyItem["marketplaceId"]?.GetValue<string>() ?? fallbackMarketplaceId,
                aggregate.LegacyItem["title"]?.GetValue<string>() ?? string.Empty,
                aggregate.LegacyItem["description"]?.GetValue<string>() ?? string.Empty,
                aggregate.LegacyItem["categoryId"]?.GetValue<string>() ?? string.Empty,
                aggregate.LegacyItem["conditionId"]?.GetValue<string>() ?? aggregate.LegacyItem["conditionDisplayName"]?.GetValue<string>() ?? string.Empty,
                aggregate.LegacyItem["conditionDisplayName"]?.GetValue<string>(),
                aggregate.LegacyItem["listingType"]?.GetValue<string>() ?? "FIXED_PRICE",
                ReadDecimal(aggregate.LegacyItem["startPrice"]) ?? 0m,
                aggregate.LegacyItem["priceCurrency"]?.GetValue<string>() ?? "USD",
                ReadInt(aggregate.LegacyItem["quantityAvailable"])
                    ?? ReadInt(aggregate.LegacyItem["quantity"])
                    ?? 0,
                null,
                null,
                legacyImages,
                legacyAspects,
                null,
                null,
                "en-US");
        }

        var inventory = aggregate.InventoryItem;
        var offer = aggregate.Offer;
        var priceValue = ReadDecimal(offer?["pricingSummary"]?["price"]?["value"]) ?? 0m;
        var priceCurrency = offer?["pricingSummary"]?["price"]?["currency"]?.GetValue<string>() ?? "USD";
        var images = (inventory?["product"]?["imageUrls"] as JsonArray)?.Select(x => new ListingImageDto(x?.GetValue<string>(), null, null, null)).ToList() ?? [];

        var aspects = new Dictionary<string, IReadOnlyList<string>>();
        if (inventory?["product"]?["aspects"] is JsonObject aspectsObject)
        {
            foreach (var kvp in aspectsObject)
            {
                if (kvp.Value is JsonArray values)
                {
                    aspects[kvp.Key] = values.Select(x => x?.GetValue<string>() ?? string.Empty).Where(x => !string.IsNullOrWhiteSpace(x)).ToArray();
                }
            }
        }

        return new ListingSpecDto(
            aggregate.Sku,
            offer?["marketplaceId"]?.GetValue<string>() ?? fallbackMarketplaceId,
            inventory?["product"]?["title"]?.GetValue<string>() ?? string.Empty,
            inventory?["product"]?["description"]?.GetValue<string>() ?? offer?["listingDescription"]?.GetValue<string>() ?? string.Empty,
            offer?["categoryId"]?.GetValue<string>() ?? string.Empty,
            inventory?["condition"]?.GetValue<string>() ?? string.Empty,
            inventory?["conditionDescription"]?.GetValue<string>(),
            offer?["format"]?.GetValue<string>() ?? "FIXED_PRICE",
            priceValue,
            priceCurrency,
            ReadInt(inventory?["availability"]?["shipToLocationAvailability"]?["quantity"]) ?? ReadInt(offer?["availableQuantity"]) ?? 0,
            new ListingPoliciesDto(offer?["listingPolicies"]?["paymentPolicyId"]?.GetValue<string>(), offer?["listingPolicies"]?["returnPolicyId"]?.GetValue<string>(), offer?["listingPolicies"]?["fulfillmentPolicyId"]?.GetValue<string>()),
            offer?["merchantLocationKey"]?.GetValue<string>(),
            images,
            aspects,
            inventory?["packageWeightAndSize"]?.Deserialize<JsonElement>(),
            ReadConditionDescriptors(inventory?["conditionDescriptors"]),
            "en-US");
    }

    private static ListingSpecDto Merge(ListingSpecDto current, ListingPatchDto patch)
        => new(
            patch.Sku ?? current.Sku,
            patch.MarketplaceId ?? current.MarketplaceId,
            patch.Title ?? current.Title,
            patch.Description ?? current.Description,
            patch.CategoryId ?? current.CategoryId,
            patch.Condition ?? current.Condition,
            patch.ConditionDescription ?? current.ConditionDescription,
            patch.Format ?? current.Format,
            patch.PriceValue ?? current.PriceValue,
            patch.PriceCurrency ?? current.PriceCurrency,
            patch.AvailableQuantity ?? current.AvailableQuantity,
            patch.Policies ?? current.Policies,
            patch.LocationKey ?? current.LocationKey,
            patch.Images ?? current.Images,
            patch.Aspects ?? current.Aspects,
            patch.PackageWeightAndSize ?? current.PackageWeightAndSize,
            patch.ConditionDescriptors ?? current.ConditionDescriptors,
            patch.Locale ?? current.Locale);

    private static JsonObject BuildInventoryPayload(ListingSpecDto request, IReadOnlyList<string> imageUrls)
    {
        var product = new JsonObject
        {
            ["title"] = request.Title,
            ["description"] = request.Description,
            ["imageUrls"] = new JsonArray(imageUrls.Select(x => (JsonNode?)x).ToArray())
        };
        if (request.Aspects is not null && request.Aspects.Count > 0)
        {
            var aspects = new JsonObject();
            foreach (var kvp in request.Aspects)
            {
                aspects[kvp.Key] = new JsonArray(kvp.Value.Select(x => (JsonNode?)x).ToArray());
            }
            product["aspects"] = aspects;
        }

        var payload = new JsonObject
        {
            ["availability"] = new JsonObject
            {
                ["shipToLocationAvailability"] = new JsonObject
                {
                    ["quantity"] = request.AvailableQuantity
                }
            },
            ["condition"] = request.Condition,
            ["product"] = product
        };

        if (!string.IsNullOrWhiteSpace(request.ConditionDescription)) payload["conditionDescription"] = request.ConditionDescription;
        if (request.ConditionDescriptors is not null && request.ConditionDescriptors.Count > 0)
        {
            payload["conditionDescriptors"] = new JsonArray(request.ConditionDescriptors.Select(descriptor => (JsonNode)new JsonObject
            {
                ["name"] = descriptor.Name,
                ["values"] = new JsonArray(descriptor.Values.Select(value => (JsonNode?)value).ToArray())
            }).ToArray());
        }
        if (request.PackageWeightAndSize.HasValue) payload["packageWeightAndSize"] = JsonNode.Parse(request.PackageWeightAndSize.Value.GetRawText());
        return payload;
    }

    private static JsonObject BuildOfferPayload(LocalEbaySessionContextDto session, ListingSpecDto request)
    {
        var effectivePolicies = new ListingPoliciesDto(
            request.Policies?.PaymentPolicyId ?? session.DefaultPaymentPolicyId,
            request.Policies?.ReturnPolicyId ?? session.DefaultReturnPolicyId,
            request.Policies?.FulfillmentPolicyId ?? session.DefaultFulfillmentPolicyId);

        if (string.IsNullOrWhiteSpace(effectivePolicies.PaymentPolicyId) ||
            string.IsNullOrWhiteSpace(effectivePolicies.ReturnPolicyId) ||
            string.IsNullOrWhiteSpace(effectivePolicies.FulfillmentPolicyId))
        {
            throw new InvalidOperationException("Listing offer requires payment, return, and fulfillment policy IDs.");
        }

        var effectiveLocationKey = request.LocationKey ?? session.DefaultLocationKey;
        if (string.IsNullOrWhiteSpace(effectiveLocationKey))
        {
            throw new InvalidOperationException("Listing offer requires a merchant location key.");
        }

        return new JsonObject
        {
            ["sku"] = request.Sku,
            ["marketplaceId"] = request.MarketplaceId ?? session.MarketplaceId,
            ["format"] = request.Format ?? "FIXED_PRICE",
            ["availableQuantity"] = request.AvailableQuantity,
            ["categoryId"] = request.CategoryId,
            ["listingDescription"] = request.Description,
            ["merchantLocationKey"] = effectiveLocationKey,
            ["pricingSummary"] = new JsonObject
            {
                ["price"] = new JsonObject
                {
                    ["value"] = request.PriceValue,
                    ["currency"] = request.PriceCurrency ?? "USD"
                }
            },
            ["listingPolicies"] = new JsonObject
            {
                ["paymentPolicyId"] = effectivePolicies.PaymentPolicyId,
                ["returnPolicyId"] = effectivePolicies.ReturnPolicyId,
                ["fulfillmentPolicyId"] = effectivePolicies.FulfillmentPolicyId
            }
        };
    }

    private static JsonObject BuildLegacyRevisePayload(ListingAggregate aggregate, ListingSpecDto request, IReadOnlyList<string> imageUrls)
    {
        var itemSpecifics = new JsonObject();
        foreach (var kvp in request.Aspects ?? new Dictionary<string, IReadOnlyList<string>>())
        {
            itemSpecifics[kvp.Key] = new JsonArray(kvp.Value.Select(x => (JsonNode?)x).ToArray());
        }

        return new JsonObject
        {
            ["listingId"] = aggregate.LegacyItem?["listingId"]?.GetValue<string>() ?? throw new InvalidOperationException("No listingId found for legacy listing."),
            ["sku"] = string.IsNullOrWhiteSpace(request.Sku) ? aggregate.Sku : request.Sku,
            ["title"] = request.Title,
            ["description"] = request.Description,
            ["categoryId"] = request.CategoryId,
            ["conditionId"] = request.Condition,
            ["priceValue"] = request.PriceValue,
            ["priceCurrency"] = request.PriceCurrency ?? aggregate.LegacyItem?["priceCurrency"]?.GetValue<string>() ?? "USD",
            ["quantity"] = request.AvailableQuantity,
            ["pictureUrls"] = new JsonArray(imageUrls.Select(x => (JsonNode?)x).ToArray()),
            ["itemSpecifics"] = itemSpecifics
        };
    }

    private async Task<JsonObject?> RecoverExistingOfferAsync(
        EbayEnvironmentDescriptor environment,
        LocalEbaySessionContextDto session,
        ListingSpecDto request,
        JsonObject offerPayload,
        string effectiveMarketplaceId,
        CancellationToken cancellationToken)
    {
        var matches = ReadArray(await gateway.GetOffersAsync(environment, session.AccessToken, request.Sku, cancellationToken), "offers")
            .Where(offer => string.Equals(offer["marketplaceId"]?.GetValue<string>() ?? session.MarketplaceId, effectiveMarketplaceId, StringComparison.OrdinalIgnoreCase))
            .ToList();

        if (matches.Count > 1)
        {
            matches = matches
                .Where(offer => string.Equals(offer["categoryId"]?.GetValue<string>(), request.CategoryId, StringComparison.OrdinalIgnoreCase))
                .ToList();
        }

        if (matches.Count != 1)
        {
            return null;
        }

        var recovered = matches[0];
        if (!string.IsNullOrWhiteSpace(recovered["listingId"]?.GetValue<string>()))
        {
            return recovered;
        }

        var offerId = recovered["offerId"]?.GetValue<string>();
        if (string.IsNullOrWhiteSpace(offerId))
        {
            return null;
        }

        await gateway.UpdateOfferAsync(environment, session.AccessToken, offerId, offerPayload, request.Locale, effectiveMarketplaceId, cancellationToken);
        return await gateway.GetOfferAsync(environment, session.AccessToken, offerId, cancellationToken);
    }

    private static bool IsAlreadyExistingOfferError(Exception exception)
        => exception.Message.Contains("Offer entity already exists", StringComparison.OrdinalIgnoreCase);

    private static string? InferSingleId(JsonObject payload, string arrayName, string idField)
    {
        var items = ReadArray(payload, arrayName);
        return items.Count == 1 ? items[0][idField]?.GetValue<string>() : null;
    }

    private static List<JsonObject> ReadArray(JsonObject payload, string propertyName)
        => payload[propertyName] is JsonArray array ? array.OfType<JsonObject>().ToList() : [];

    private static decimal? ReadDecimal(JsonNode? node)
    {
        if (node is not JsonValue value)
        {
            return null;
        }

        if (value.TryGetValue<decimal>(out var decimalValue))
        {
            return decimalValue;
        }

        if (value.TryGetValue<string>(out var stringValue) &&
            decimal.TryParse(stringValue, NumberStyles.Number, CultureInfo.InvariantCulture, out var parsed))
        {
            return parsed;
        }

        return null;
    }

    private static int? ReadInt(JsonNode? node)
    {
        if (node is not JsonValue value)
        {
            return null;
        }

        if (value.TryGetValue<int>(out var intValue))
        {
            return intValue;
        }

        if (value.TryGetValue<string>(out var stringValue) &&
            int.TryParse(stringValue, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed))
        {
            return parsed;
        }

        return null;
    }

    private static IReadOnlyList<ListingConditionDescriptorDto>? ReadConditionDescriptors(JsonNode? node)
    {
        if (node is not JsonArray descriptors || descriptors.Count == 0)
        {
            return null;
        }

        return descriptors
            .OfType<JsonObject>()
            .Select(descriptor => new ListingConditionDescriptorDto(
                descriptor["name"]?.GetValue<string>() ?? string.Empty,
                descriptor["values"] is JsonArray values
                    ? values
                        .Select(value => value switch
                        {
                            null => null,
                            JsonValue jsonValue when jsonValue.TryGetValue<string>(out var stringValue) => stringValue,
                            _ => value!.ToJsonString().Trim('"')
                        })
                        .Where(value => !string.IsNullOrWhiteSpace(value))
                        .Cast<string>()
                        .ToArray()
                    : []))
            .Where(descriptor => !string.IsNullOrWhiteSpace(descriptor.Name) && descriptor.Values.Count > 0)
            .ToArray();
    }

    private static DateTimeOffset? ParseDateTimeOffset(string? value)
        => DateTimeOffset.TryParse(value, out var parsed) ? parsed : null;

    private static DoctorCheckDto BuildDoctorFailureCheck(string name, string message, Exception exception)
        => new(name, false, message, new { exception.Message });

    private sealed record ListingAggregate(
        string Sku,
        string MarketplaceId,
        JsonObject? InventoryItem,
        JsonObject? Offer,
        JsonObject? Listing,
        JsonObject? LegacyItem);
}
