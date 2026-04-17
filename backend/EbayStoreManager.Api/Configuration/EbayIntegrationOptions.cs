namespace EbayStoreManager.Api.Configuration;

public sealed class EbayIntegrationOptions
{
    public const string SectionName = "Ebay";

    public string PublicBaseUrl { get; set; } = "https://localhost:7217";

    public string CallbackPath { get; set; } = "/oauth/ebay/callback";

    public string[] Scopes { get; set; } =
    [
        "https://api.ebay.com/oauth/api_scope",
        "https://api.ebay.com/oauth/api_scope/sell.account",
        "https://api.ebay.com/oauth/api_scope/sell.inventory",
        "https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly",
        "https://api.ebay.com/oauth/api_scope/commerce.identity.readonly"
    ];

    public EbayEnvironmentOptions Production { get; set; } = new()
    {
        AuthBaseUrl = "https://auth.ebay.com/oauth2",
        ApiBaseUrl = "https://api.ebay.com",
        IdentityBaseUrl = "https://apiz.ebay.com",
        MediaBaseUrl = "https://apim.ebay.com"
    };

    public EbayEnvironmentOptions Sandbox { get; set; } = new()
    {
        AuthBaseUrl = "https://auth.sandbox.ebay.com/oauth2",
        ApiBaseUrl = "https://api.sandbox.ebay.com",
        IdentityBaseUrl = "https://apiz.sandbox.ebay.com",
        MediaBaseUrl = "https://apim.sandbox.ebay.com"
    };
}

public sealed class EbayEnvironmentOptions
{
    public string ClientId { get; set; } = string.Empty;

    public string ClientSecret { get; set; } = string.Empty;

    public string RuName { get; set; } = string.Empty;

    public string AuthBaseUrl { get; set; } = string.Empty;

    public string ApiBaseUrl { get; set; } = string.Empty;

    public string IdentityBaseUrl { get; set; } = string.Empty;

    public string MediaBaseUrl { get; set; } = string.Empty;
}
