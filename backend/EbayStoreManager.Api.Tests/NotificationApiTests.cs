using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace EbayStoreManager.Api.Tests;

public sealed class NotificationApiTests
{
    [Fact]
    public async Task ChallengeEndpoint_ReturnsExpectedChallengeResponse()
    {
        await using var factory = new TestWebApplicationFactory();
        using var client = factory.CreateClient();

        const string challengeCode = "sample-challenge-code";
        const string verificationToken = "test-verification-token-1234567890";
        const string endpoint = "http://localhost/notifications/ebay/marketplace-account-deletion";

        var response = await client.GetAsync($"/notifications/ebay/marketplace-account-deletion?challenge_code={challengeCode}");
        response.EnsureSuccessStatusCode();

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var challengeResponse = document.RootElement.GetProperty("challengeResponse").GetString();

        var expected = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{challengeCode}{verificationToken}{endpoint}"))).ToLowerInvariant();

        Assert.Equal(expected, challengeResponse);
    }
}
