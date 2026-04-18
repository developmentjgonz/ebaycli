namespace EbayStoreManager.Api.Configuration;

public sealed class LegalOptions
{
    public const string SectionName = "Legal";

    public string CompanyName { get; set; } = "ebaycli Backend";

    public string ContactEmail { get; set; } = "privacy@example.com";

    public string EffectiveDate { get; set; } = "2026-04-18";

    public string WebsiteUrl { get; set; } = "https://example.com";
}
