using EbayStoreManager.Api.Configuration;
using Microsoft.Extensions.Options;

namespace EbayStoreManager.Api.Services;

public sealed record EbayEnvironmentDescriptor(
    string Name,
    string ClientId,
    string ClientSecret,
    string RuName,
    string AuthBaseUrl,
    string ApiBaseUrl,
    string IdentityBaseUrl,
    string MediaBaseUrl,
    string TradingBaseUrl);

public sealed class EbayEnvironmentResolver(IOptions<EbayIntegrationOptions> options)
{
    public EbayEnvironmentDescriptor Resolve(string environment)
    {
        var normalized = environment.Trim().ToLowerInvariant();
        var integration = options.Value;
        var source = normalized switch
        {
            "production" => integration.Production,
            "sandbox" => integration.Sandbox,
            _ => throw new InvalidOperationException($"Unsupported eBay environment '{environment}'.")
        };

        if (string.IsNullOrWhiteSpace(source.ClientId) ||
            string.IsNullOrWhiteSpace(source.ClientSecret) ||
            string.IsNullOrWhiteSpace(source.RuName))
        {
            throw new InvalidOperationException(
                $"Missing eBay credentials for {normalized}. Configure {EbayIntegrationOptions.SectionName}:{char.ToUpper(normalized[0]) + normalized[1..]}.");
        }

        return new EbayEnvironmentDescriptor(
            normalized,
            source.ClientId,
            source.ClientSecret,
            source.RuName,
            source.AuthBaseUrl,
            source.ApiBaseUrl,
            source.IdentityBaseUrl,
            source.MediaBaseUrl,
            normalized == "sandbox" ? "https://api.sandbox.ebay.com/ws/api.dll" : "https://api.ebay.com/ws/api.dll");
    }
}
