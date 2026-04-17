using System.Text.Json.Nodes;

namespace EbayStoreManager.Api.Services;

public interface IEbayMarketplaceGateway
{
    Task<JsonObject> ExchangeAuthorizationCodeAsync(EbayEnvironmentDescriptor environment, string code, CancellationToken cancellationToken);
    Task<JsonObject> RefreshAccessTokenAsync(EbayEnvironmentDescriptor environment, string refreshToken, string[] scopes, CancellationToken cancellationToken);
    Task<JsonObject> GetUserAsync(EbayEnvironmentDescriptor environment, string accessToken, CancellationToken cancellationToken);
    Task<JsonObject> GetPrivilegesAsync(EbayEnvironmentDescriptor environment, string accessToken, CancellationToken cancellationToken);
    Task<JsonObject> GetPaymentPoliciesAsync(EbayEnvironmentDescriptor environment, string accessToken, string marketplaceId, CancellationToken cancellationToken);
    Task<JsonObject> GetFulfillmentPoliciesAsync(EbayEnvironmentDescriptor environment, string accessToken, string marketplaceId, CancellationToken cancellationToken);
    Task<JsonObject> GetReturnPoliciesAsync(EbayEnvironmentDescriptor environment, string accessToken, string marketplaceId, CancellationToken cancellationToken);
    Task CreatePaymentPolicyAsync(EbayEnvironmentDescriptor environment, string accessToken, JsonObject payload, CancellationToken cancellationToken);
    Task CreateFulfillmentPolicyAsync(EbayEnvironmentDescriptor environment, string accessToken, JsonObject payload, CancellationToken cancellationToken);
    Task CreateReturnPolicyAsync(EbayEnvironmentDescriptor environment, string accessToken, JsonObject payload, CancellationToken cancellationToken);
    Task<JsonObject> OptInToProgramAsync(EbayEnvironmentDescriptor environment, string accessToken, string programType, CancellationToken cancellationToken);
    Task<JsonObject> GetLocationsAsync(EbayEnvironmentDescriptor environment, string accessToken, CancellationToken cancellationToken);
    Task CreateInventoryLocationAsync(EbayEnvironmentDescriptor environment, string accessToken, string merchantLocationKey, JsonObject payload, string? locale, string? marketplaceId, CancellationToken cancellationToken);
    Task UpdateInventoryLocationAsync(EbayEnvironmentDescriptor environment, string accessToken, string merchantLocationKey, JsonObject payload, string? locale, string? marketplaceId, CancellationToken cancellationToken);
    Task<JsonObject> GetInventoryItemAsync(EbayEnvironmentDescriptor environment, string accessToken, string sku, CancellationToken cancellationToken);
    Task<JsonObject> GetInventoryItemsAsync(EbayEnvironmentDescriptor environment, string accessToken, int limit, int offset, CancellationToken cancellationToken);
    Task UpsertInventoryItemAsync(EbayEnvironmentDescriptor environment, string accessToken, string sku, JsonObject payload, string? locale, string? marketplaceId, CancellationToken cancellationToken);
    Task<JsonObject> GetOffersAsync(EbayEnvironmentDescriptor environment, string accessToken, string? sku, CancellationToken cancellationToken);
    Task<JsonObject> GetOfferAsync(EbayEnvironmentDescriptor environment, string accessToken, string offerId, CancellationToken cancellationToken);
    Task<JsonObject> CreateOfferAsync(EbayEnvironmentDescriptor environment, string accessToken, JsonObject payload, string? locale, string? marketplaceId, CancellationToken cancellationToken);
    Task UpdateOfferAsync(EbayEnvironmentDescriptor environment, string accessToken, string offerId, JsonObject payload, string? locale, string? marketplaceId, CancellationToken cancellationToken);
    Task<JsonObject> PublishOfferAsync(EbayEnvironmentDescriptor environment, string accessToken, string offerId, CancellationToken cancellationToken);
    Task WithdrawOfferAsync(EbayEnvironmentDescriptor environment, string accessToken, string offerId, CancellationToken cancellationToken);
    Task<JsonObject> BulkUpdatePriceQuantityAsync(EbayEnvironmentDescriptor environment, string accessToken, JsonObject payload, CancellationToken cancellationToken);
    Task<JsonObject> GetListingAsync(EbayEnvironmentDescriptor environment, string accessToken, string listingId, CancellationToken cancellationToken);
    Task<JsonObject> CreateImageFromUrlAsync(EbayEnvironmentDescriptor environment, string accessToken, string sourceUrl, CancellationToken cancellationToken);
    Task<JsonObject> CreateImageFromFileAsync(EbayEnvironmentDescriptor environment, string accessToken, byte[] content, string fileName, string contentType, CancellationToken cancellationToken);
    Task<IReadOnlyList<JsonObject>> GetActiveListingsAsync(EbayEnvironmentDescriptor environment, string accessToken, string marketplaceId, int pageNumber, int entriesPerPage, CancellationToken cancellationToken);
    Task<IReadOnlyList<JsonObject>> GetSoldListingsAsync(EbayEnvironmentDescriptor environment, string accessToken, string marketplaceId, int durationInDays, int pageNumber, int entriesPerPage, CancellationToken cancellationToken);
    Task<JsonObject> GetLegacyListingAsync(EbayEnvironmentDescriptor environment, string accessToken, string marketplaceId, string listingId, CancellationToken cancellationToken);
    Task<JsonObject> ReviseInventoryStatusAsync(EbayEnvironmentDescriptor environment, string accessToken, string marketplaceId, string listingId, string? sku, decimal? priceValue, string? priceCurrency, int? quantity, CancellationToken cancellationToken);
    Task<JsonObject> ReviseFixedPriceItemAsync(EbayEnvironmentDescriptor environment, string accessToken, string marketplaceId, JsonObject payload, CancellationToken cancellationToken);
    Task<JsonObject> EndFixedPriceItemAsync(EbayEnvironmentDescriptor environment, string accessToken, string marketplaceId, string listingId, string endingReason, CancellationToken cancellationToken);
}
