namespace EbayStoreManager.Api.Configuration;

public sealed class LegalOptions
{
    public const string SectionName = "Legal";

    public string CompanyName { get; set; } = "eBay Store Validation";

    public string ContactEmail { get; set; } = "privacy@ebaystore-validation-api-174140.azurewebsites.net";

    public string EffectiveDate { get; set; } = "2026-04-16";

    public string WebsiteUrl { get; set; } = "https://ebaystore-validation-api-174140.azurewebsites.net";
}
