namespace EbayStoreManager.Api.Configuration;

public sealed class OperationalOptions
{
    public const string SectionName = "Operations";

    public RateLimitingOptions RateLimiting { get; set; } = new();

    public AuthStateCleanupOptions AuthStateCleanup { get; set; } = new();

    public EbayRetryOptions EbayRetries { get; set; } = new();
}

public sealed class RateLimitingOptions
{
    public int AnonymousPermitLimit { get; set; } = 20;

    public int AnonymousWindowSeconds { get; set; } = 60;
}

public sealed class AuthStateCleanupOptions
{
    public int RetentionHours { get; set; } = 24;

    public int IntervalMinutes { get; set; } = 30;
}

public sealed class EbayRetryOptions
{
    public int MaxAttempts { get; set; } = 3;

    public int BaseDelayMilliseconds { get; set; } = 250;
}
