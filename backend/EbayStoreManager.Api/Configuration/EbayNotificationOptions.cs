namespace EbayStoreManager.Api.Configuration;

public sealed class EbayNotificationOptions
{
    public const string SectionName = "Ebay:Notifications";

    public string MarketplaceAccountDeletionPath { get; set; } = "/notifications/ebay/marketplace-account-deletion";

    public string AuthorizationRevocationPath { get; set; } = "/notifications/ebay/authorization-revocation";

    public string VerificationToken { get; set; } = string.Empty;
}
