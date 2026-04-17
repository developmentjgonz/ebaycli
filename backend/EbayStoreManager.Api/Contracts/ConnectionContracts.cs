namespace EbayStoreManager.Api.Contracts;

public sealed record EbayConnectionResponse(
    string StoreOwnerSlug,
    bool Connected,
    string? Environment,
    string? MarketplaceId,
    string? EbayUserId,
    string? EbayUsername,
    string? AccountType,
    bool? SellerRegistrationCompleted,
    DateTimeOffset? AccessTokenExpiresAtUtc,
    DateTimeOffset? ConnectedAtUtc,
    DateTimeOffset? LastTokenRefreshAtUtc);
