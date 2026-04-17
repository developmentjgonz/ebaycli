using System.Text.Json;

namespace EbayStoreManager.Api.Contracts;

public sealed record LocalEbayAuthStartRequest(
    string Environment,
    string CallbackUrl,
    string? MarketplaceId);

public sealed record LocalEbayAuthStartResponse(
    string AuthorizeUrl,
    string State,
    string Environment,
    string MarketplaceId,
    DateTimeOffset ExpiresAtUtc);

public sealed record LocalEbayAuthExchangeRequest(
    string State,
    string Code);

public sealed record LocalEbayRefreshRequest(
    string Environment,
    string RefreshToken,
    string? MarketplaceId,
    string? DefaultPaymentPolicyId,
    string? DefaultReturnPolicyId,
    string? DefaultFulfillmentPolicyId,
    string? DefaultLocationKey);

public sealed record LocalEbaySessionDto(
    string Environment,
    string MarketplaceId,
    string AccessToken,
    string RefreshToken,
    DateTimeOffset AccessTokenExpiresAtUtc,
    DateTimeOffset? RefreshTokenExpiresAtUtc,
    string? Scope,
    string? TokenType,
    string? EbayUserId,
    string? EbayUsername,
    string? AccountType,
    bool? SellerRegistrationCompleted,
    string? DefaultPaymentPolicyId,
    string? DefaultReturnPolicyId,
    string? DefaultFulfillmentPolicyId,
    string? DefaultLocationKey);

public sealed record LocalEbaySessionContextDto(
    string Environment,
    string MarketplaceId,
    string AccessToken,
    string? DefaultPaymentPolicyId,
    string? DefaultReturnPolicyId,
    string? DefaultFulfillmentPolicyId,
    string? DefaultLocationKey);

public sealed record LocalDoctorRequest(
    LocalEbaySessionContextDto Session);

public sealed record LocalPolicySyncRequest(
    LocalEbaySessionContextDto Session,
    string? PaymentPolicyId,
    string? ReturnPolicyId,
    string? FulfillmentPolicyId,
    JsonElement? CreatePayload);

public sealed record LocalPolicyProgramOptInRequest(
    LocalEbaySessionContextDto Session,
    string ProgramType);

public sealed record LocalLocationUpsertRequest(
    LocalEbaySessionContextDto Session,
    string? MerchantLocationKey,
    JsonElement? LocationPayload);

public sealed record LocalListListingsRequest(
    LocalEbaySessionContextDto Session,
    string? Status,
    int? Page,
    int? Limit,
    int? Days);

public sealed record LocalListingReferenceRequest(
    LocalEbaySessionContextDto Session,
    string Reference);

public sealed record LocalCreateListingRequest(
    LocalEbaySessionContextDto Session,
    ListingSpecDto Listing);

public sealed record LocalUpdateListingRequest(
    LocalEbaySessionContextDto Session,
    string Reference,
    ListingPatchDto Listing);

public sealed record LocalEndListingRequest(
    LocalEbaySessionContextDto Session,
    string Reference);
