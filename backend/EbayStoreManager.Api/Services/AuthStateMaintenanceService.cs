using EbayStoreManager.Api.Configuration;
using EbayStoreManager.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace EbayStoreManager.Api.Services;

public sealed class AuthStateMaintenanceService(
    IServiceScopeFactory scopeFactory,
    IOptions<OperationalOptions> options,
    ILogger<AuthStateMaintenanceService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var interval = TimeSpan.FromMinutes(Math.Max(1, options.Value.AuthStateCleanup.IntervalMinutes));

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await CleanupExpiredStatesAsync(stoppingToken);
            }
            catch (Exception exception)
            {
                logger.LogError(exception, "Failed to clean up expired local eBay auth states.");
            }

            try
            {
                await Task.Delay(interval, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    public async Task<int> CleanupExpiredStatesAsync(CancellationToken cancellationToken)
    {
        using var scope = scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var retention = TimeSpan.FromHours(Math.Max(1, options.Value.AuthStateCleanup.RetentionHours));
        var cutoff = DateTimeOffset.UtcNow.Subtract(retention);

        var expired = (await dbContext.LocalEbayAuthStates.ToListAsync(cancellationToken))
            .Where(x => x.ExpiresAtUtc < cutoff || (x.ConsumedAtUtc.HasValue && x.ConsumedAtUtc.Value < cutoff))
            .ToList();

        if (expired.Count == 0)
        {
            return 0;
        }

        dbContext.LocalEbayAuthStates.RemoveRange(expired);
        await dbContext.SaveChangesAsync(cancellationToken);
        logger.LogInformation("Cleaned up {Count} expired local eBay auth states.", expired.Count);
        return expired.Count;
    }
}
