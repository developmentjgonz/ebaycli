using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using EbayStoreManager.Api.Configuration;

namespace EbayStoreManager.Api.Tests;

internal sealed class TestWebApplicationFactory : WebApplicationFactory<Program>
{
    private readonly string _sqlitePath = Path.Combine(Path.GetTempPath(), $"ebay-store-manager-tests-{Guid.NewGuid():N}.db");

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.ConfigureAppConfiguration((_, configBuilder) =>
        {
            configBuilder.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:Sqlite"] = $"Data Source={_sqlitePath}",
                ["Ebay:Notifications:VerificationToken"] = "test-verification-token-1234567890",
                ["Operations:RateLimiting:AnonymousPermitLimit"] = "2",
                ["Operations:RateLimiting:AnonymousWindowSeconds"] = "60",
                ["Operations:AuthStateCleanup:RetentionHours"] = "1",
                ["Operations:AuthStateCleanup:IntervalMinutes"] = "60",
                ["Operations:EbayRetries:MaxAttempts"] = "2",
                ["Operations:EbayRetries:BaseDelayMilliseconds"] = "1",
                ["Legal:CompanyName"] = "Test Privacy Company",
                ["Legal:ContactEmail"] = "privacy@example.test",
                ["Legal:EffectiveDate"] = "2026-04-16",
                ["Legal:WebsiteUrl"] = "https://example.test"
            });
        });

        builder.ConfigureServices(services =>
        {
            services.PostConfigure<EbayIntegrationOptions>(options =>
            {
                options.Sandbox.ClientId = "sandbox-client";
                options.Sandbox.ClientSecret = "sandbox-secret";
                options.Sandbox.RuName = "sandbox-runame";
                options.Production.ClientId = "production-client";
                options.Production.ClientSecret = "production-secret";
                options.Production.RuName = "production-runame";
            });
        });
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (disposing && File.Exists(_sqlitePath))
        {
            File.Delete(_sqlitePath);
        }
    }
}
