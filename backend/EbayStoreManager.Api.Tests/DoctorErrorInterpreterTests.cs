using EbayStoreManager.Api.Services;

namespace EbayStoreManager.Api.Tests;

public sealed class DoctorErrorInterpreterTests
{
    [Fact]
    public void TryBuildBusinessPolicyChecks_ReturnsStructuredFailures()
    {
        var exception = new InvalidOperationException(
            "eBay API request failed (400): {\"errors\":[{\"longMessage\":\"User is not eligible for Business Policy.\"}]}");

        var handled = DoctorErrorInterpreter.TryBuildBusinessPolicyChecks(exception, out var checks);

        Assert.True(handled);
        Assert.Equal(3, checks.Count);
        Assert.All(checks, check =>
        {
            Assert.False(check.Ok);
            Assert.Contains("Business Policies", check.Message, StringComparison.OrdinalIgnoreCase);
        });
    }
}
