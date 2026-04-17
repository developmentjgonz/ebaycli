namespace EbayStoreManager.Api.Domain;

public sealed class LocalEbayAuthState
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public string State { get; set; } = string.Empty;

    public string Environment { get; set; } = string.Empty;

    public string MarketplaceId { get; set; } = string.Empty;

    public string CallbackUrl { get; set; } = string.Empty;

    public string? ExchangeCodeHash { get; set; }

    public string? AccessTokenCipher { get; set; }

    public string? RefreshTokenCipher { get; set; }

    public DateTimeOffset? AccessTokenExpiresAtUtc { get; set; }

    public DateTimeOffset? RefreshTokenExpiresAtUtc { get; set; }

    public string? Scope { get; set; }

    public string? TokenType { get; set; }

    public string? EbayUserId { get; set; }

    public string? EbayUsername { get; set; }

    public string? AccountType { get; set; }

    public bool? SellerRegistrationCompleted { get; set; }

    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;

    public DateTimeOffset ExpiresAtUtc { get; set; }

    public DateTimeOffset? CompletedAtUtc { get; set; }

    public DateTimeOffset? ConsumedAtUtc { get; set; }
}
