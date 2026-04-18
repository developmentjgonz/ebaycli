using System.Net.Http.Json;
using System.Web;
using EbayStoreManager.Api.Contracts;

namespace EbayStoreManager.Api.Tests;

public sealed class LocalEbayApiTests
{
    [Fact]
    public async Task PrivacyPolicy_IsServedPublicly()
    {
        await using var factory = new TestWebApplicationFactory();
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/privacy");
        response.EnsureSuccessStatusCode();

        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("Privacy Policy", body);
        Assert.Contains("privacy@example.test", body);
        Assert.Contains("Test Privacy Company", body);
    }

    [Fact]
    public async Task AuthLandingPages_AreServedPublicly()
    {
        await using var factory = new TestWebApplicationFactory();
        using var client = factory.CreateClient();

        var success = await client.GetAsync("/auth/success?code=abc123&state=state-1");
        success.EnsureSuccessStatusCode();
        var successBody = await success.Content.ReadAsStringAsync();
        Assert.Contains("Authorization complete", successBody);
        Assert.Contains("abc123", successBody);
        Assert.Contains("/privacy", successBody);

        var declined = await client.GetAsync("/auth/declined");
        declined.EnsureSuccessStatusCode();
        var declinedBody = await declined.Content.ReadAsStringAsync();
        Assert.Contains("Authorization declined", declinedBody);
    }

    [Fact]
    public async Task LlmsTxt_IsServedPublicly()
    {
        await using var factory = new TestWebApplicationFactory();
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/llms.txt");
        response.EnsureSuccessStatusCode();

        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("# ebaycli", body);
        Assert.Contains("cd cli && node dist/index.js guide --json", body);
        Assert.Contains("Trading/classic listings", body);
    }

    [Fact]
    public async Task LocalAuthorizeStart_IsRateLimited()
    {
        await using var factory = new TestWebApplicationFactory();
        using var client = factory.CreateClient();

        for (var attempt = 0; attempt < 2; attempt++)
        {
            var okay = await client.PostAsJsonAsync("/api/local/ebay/authorize/start",
                new LocalEbayAuthStartRequest("sandbox", "http://127.0.0.1:8765/callback", "EBAY_US"));
            okay.EnsureSuccessStatusCode();
        }

        var limited = await client.PostAsJsonAsync("/api/local/ebay/authorize/start",
            new LocalEbayAuthStartRequest("sandbox", "http://127.0.0.1:8765/callback", "EBAY_US"));

        Assert.Equal(System.Net.HttpStatusCode.TooManyRequests, limited.StatusCode);
    }

    [Fact]
    public async Task LocalAuthorizeStart_AllowsAnonymousSandboxBootstrap()
    {
        await using var factory = new TestWebApplicationFactory();
        using var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/local/ebay/authorize/start",
            new LocalEbayAuthStartRequest("sandbox", "http://127.0.0.1:8765/callback", "EBAY_US"));
        response.EnsureSuccessStatusCode();

        var started = await response.Content.ReadFromJsonAsync<LocalEbayAuthStartResponse>();
        Assert.NotNull(started);
        Assert.Equal("sandbox", started!.Environment);
        Assert.Equal("EBAY_US", started.MarketplaceId);
        Assert.False(string.IsNullOrWhiteSpace(started.State));
        Assert.Contains("https://auth.sandbox.ebay.com/oauth2/authorize", started.AuthorizeUrl);

        var authorizeUri = new Uri(started.AuthorizeUrl);
        var query = HttpUtility.ParseQueryString(authorizeUri.Query);
        Assert.Equal("sandbox-client", query["client_id"]);
        Assert.Equal("sandbox-runame", query["redirect_uri"]);
        Assert.Equal("code", query["response_type"]);
        Assert.Equal(started.State, query["state"]);
    }
}
