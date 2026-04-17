using System.Text.Json;

namespace EbayStoreManager.Api.Contracts;

public sealed record ListingPoliciesDto(
    string? PaymentPolicyId,
    string? ReturnPolicyId,
    string? FulfillmentPolicyId);

public sealed record ListingImageDto(
    string? Url,
    string? FileName,
    string? ContentType,
    string? Base64Content);

public sealed record ListingSpecDto(
    string Sku,
    string? MarketplaceId,
    string Title,
    string Description,
    string CategoryId,
    string Condition,
    string? ConditionDescription,
    string? Format,
    decimal PriceValue,
    string? PriceCurrency,
    int AvailableQuantity,
    ListingPoliciesDto? Policies,
    string? LocationKey,
    IReadOnlyList<ListingImageDto>? Images,
    IReadOnlyDictionary<string, IReadOnlyList<string>>? Aspects,
    JsonElement? PackageWeightAndSize,
    string? Locale);

public sealed record ListingPatchDto(
    string? Sku,
    string? MarketplaceId,
    string? Title,
    string? Description,
    string? CategoryId,
    string? Condition,
    string? ConditionDescription,
    string? Format,
    decimal? PriceValue,
    string? PriceCurrency,
    int? AvailableQuantity,
    ListingPoliciesDto? Policies,
    string? LocationKey,
    IReadOnlyList<ListingImageDto>? Images,
    IReadOnlyDictionary<string, IReadOnlyList<string>>? Aspects,
    JsonElement? PackageWeightAndSize,
    string? Locale);

public sealed record MutationActionDto(
    string Type,
    string Description,
    object? Payload);

public sealed record MutationPlanDto(
    string Mode,
    string Environment,
    string StoreOwnerSlug,
    string MarketplaceId,
    object Target,
    IReadOnlyList<MutationActionDto> Actions,
    IReadOnlyList<string> Warnings);

public sealed record ListingSummaryDto(
    string Sku,
    string MarketplaceId,
    string? OfferId,
    string? ListingId,
    string? Status,
    string? Title,
    decimal? PriceValue,
    string? PriceCurrency,
    int? AvailableQuantity,
    int? QuantitySold,
    DateTimeOffset? SoldAtUtc,
    string? BuyerUsername,
    string? Source,
    string? ListingUrl);

public sealed record ListingAggregateDto(
    object Aggregate,
    ListingSpecDto Spec);
