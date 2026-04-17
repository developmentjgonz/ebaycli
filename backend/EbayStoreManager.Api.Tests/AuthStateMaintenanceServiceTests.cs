using EbayStoreManager.Api.Configuration;
using EbayStoreManager.Api.Data;
using EbayStoreManager.Api.Domain;
using EbayStoreManager.Api.Services;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace EbayStoreManager.Api.Tests;

public sealed class AuthStateMaintenanceServiceTests
{
    [Fact]
    public async Task CleanupExpiredStatesAsync_RemovesExpiredRows()
    {
        await using var factory = new TestWebApplicationFactory();
        var provider = factory.Services;

        using (var scope = provider.CreateScope())
        {
            var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            dbContext.LocalEbayAuthStates.AddRange(
                new LocalEbayAuthState
                {
                    State = "expired-one",
                    Environment = "sandbox",
                    MarketplaceId = "EBAY_US",
                    CallbackUrl = "http://127.0.0.1:8765/callback",
                    ExpiresAtUtc = DateTimeOffset.UtcNow.AddHours(-3)
                },
                new LocalEbayAuthState
                {
                    State = "fresh-one",
                    Environment = "sandbox",
                    MarketplaceId = "EBAY_US",
                    CallbackUrl = "http://127.0.0.1:8765/callback",
                    ExpiresAtUtc = DateTimeOffset.UtcNow.AddMinutes(5)
                });
            await dbContext.SaveChangesAsync();
        }

        var service = new AuthStateMaintenanceService(
            provider.GetRequiredService<IServiceScopeFactory>(),
            Options.Create(new OperationalOptions
            {
                AuthStateCleanup = new AuthStateCleanupOptions
                {
                    RetentionHours = 1,
                    IntervalMinutes = 60
                }
            }),
            NullLogger<AuthStateMaintenanceService>.Instance);

        var removed = await service.CleanupExpiredStatesAsync(CancellationToken.None);

        using var verificationScope = provider.CreateScope();
        var verifyDb = verificationScope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Equal(1, removed);
        Assert.Single(verifyDb.LocalEbayAuthStates);
        Assert.Equal("fresh-one", verifyDb.LocalEbayAuthStates.Single().State);
    }
}
