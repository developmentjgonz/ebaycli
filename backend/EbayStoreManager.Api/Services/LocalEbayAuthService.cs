using System.Security.Cryptography;
using EbayStoreManager.Api.Configuration;
using EbayStoreManager.Api.Contracts;
using EbayStoreManager.Api.Data;
using EbayStoreManager.Api.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace EbayStoreManager.Api.Services;

public sealed class LocalEbayAuthService(
    AppDbContext dbContext,
    EbayEnvironmentResolver environmentResolver,
    IEbayMarketplaceGateway gateway,
    TokenCipher tokenCipher,
    IOptions<EbayIntegrationOptions> integrationOptions)
{
    private static readonly TimeSpan AuthorizationLifetime = TimeSpan.FromMinutes(10);

    public async Task<LocalEbayAuthStartResponse> BeginAuthorizationAsync(
        LocalEbayAuthStartRequest request,
        CancellationToken cancellationToken)
    {
        var environment = environmentResolver.Resolve(request.Environment);
        var state = Convert.ToHexString(RandomNumberGenerator.GetBytes(24)).ToLowerInvariant();
        var callbackUrl = NormalizeCallbackUrl(request.CallbackUrl);
        var expiresAtUtc = DateTimeOffset.UtcNow.Add(AuthorizationLifetime);

        dbContext.LocalEbayAuthStates.Add(new LocalEbayAuthState
        {
            State = state,
            Environment = environment.Name,
            MarketplaceId = string.IsNullOrWhiteSpace(request.MarketplaceId) ? "EBAY_US" : request.MarketplaceId!,
            CallbackUrl = callbackUrl,
            ExpiresAtUtc = expiresAtUtc
        });
        await dbContext.SaveChangesAsync(cancellationToken);

        var authorizeUrl =
            $"{environment.AuthBaseUrl}/authorize?client_id={Uri.EscapeDataString(environment.ClientId)}&response_type=code&redirect_uri={Uri.EscapeDataString(environment.RuName)}&scope={Uri.EscapeDataString(string.Join(' ', integrationOptions.Value.Scopes))}&state={Uri.EscapeDataString(state)}";

        return new LocalEbayAuthStartResponse(authorizeUrl, state, environment.Name, string.IsNullOrWhiteSpace(request.MarketplaceId) ? "EBAY_US" : request.MarketplaceId!, expiresAtUtc);
    }

    public async Task<bool> HasPendingStateAsync(string state, CancellationToken cancellationToken)
        => await dbContext.LocalEbayAuthStates.AnyAsync(x => x.State == state, cancellationToken);

    public async Task<(string ExchangeCode, string CallbackUrl)> CompleteAuthorizationAsync(string state, string code, CancellationToken cancellationToken)
    {
        var authState = await dbContext.LocalEbayAuthStates.FirstOrDefaultAsync(x => x.State == state, cancellationToken)
                        ?? throw new InvalidOperationException("Unknown or expired local eBay OAuth state.");
        if (authState.ExpiresAtUtc < DateTimeOffset.UtcNow)
        {
            throw new InvalidOperationException("The local eBay OAuth state has expired. Start the connection flow again.");
        }

        var environment = environmentResolver.Resolve(authState.Environment);
        var tokenResponse = await gateway.ExchangeAuthorizationCodeAsync(environment, code, cancellationToken);
        var accessToken = tokenResponse["access_token"]?.GetValue<string>() ?? throw new InvalidOperationException("eBay token response did not include an access token.");
        var refreshToken = tokenResponse["refresh_token"]?.GetValue<string>() ?? throw new InvalidOperationException("eBay token response did not include a refresh token.");
        var accessExpires = tokenResponse["expires_in"]?.GetValue<int?>() ?? 7200;
        var refreshExpires = tokenResponse["refresh_token_expires_in"]?.GetValue<int?>();

        var user = await gateway.GetUserAsync(environment, accessToken, cancellationToken);
        var privileges = await gateway.GetPrivilegesAsync(environment, accessToken, cancellationToken);
        var exchangeCode = Convert.ToHexString(RandomNumberGenerator.GetBytes(24)).ToLowerInvariant();

        authState.ExchangeCodeHash = HashExchangeCode(exchangeCode);
        authState.AccessTokenCipher = tokenCipher.Protect(accessToken);
        authState.RefreshTokenCipher = tokenCipher.Protect(refreshToken);
        authState.AccessTokenExpiresAtUtc = DateTimeOffset.UtcNow.AddSeconds(accessExpires);
        authState.RefreshTokenExpiresAtUtc = refreshExpires.HasValue ? DateTimeOffset.UtcNow.AddSeconds(refreshExpires.Value) : null;
        authState.Scope = tokenResponse["scope"]?.GetValue<string>();
        authState.TokenType = tokenResponse["token_type"]?.GetValue<string>();
        authState.EbayUserId = user["userId"]?.GetValue<string>();
        authState.EbayUsername = user["username"]?.GetValue<string>();
        authState.AccountType = user["accountType"]?.GetValue<string>();
        authState.SellerRegistrationCompleted = privileges["sellerRegistrationCompleted"]?.GetValue<bool?>();
        authState.CompletedAtUtc = DateTimeOffset.UtcNow;
        authState.ExpiresAtUtc = DateTimeOffset.UtcNow.AddMinutes(5);

        await dbContext.SaveChangesAsync(cancellationToken);
        return (exchangeCode, authState.CallbackUrl);
    }

    public async Task<LocalEbaySessionDto> ExchangeAuthorizationAsync(LocalEbayAuthExchangeRequest request, CancellationToken cancellationToken)
    {
        var authState = await dbContext.LocalEbayAuthStates.FirstOrDefaultAsync(x => x.State == request.State, cancellationToken)
                        ?? throw new InvalidOperationException("The local eBay login could not be completed.");
        if (authState.ExpiresAtUtc < DateTimeOffset.UtcNow ||
            authState.ConsumedAtUtc.HasValue ||
            string.IsNullOrWhiteSpace(authState.ExchangeCodeHash) ||
            !StringComparer.Ordinal.Equals(authState.ExchangeCodeHash, HashExchangeCode(request.Code)))
        {
            throw new InvalidOperationException("The local eBay login could not be completed.");
        }

        authState.ConsumedAtUtc = DateTimeOffset.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);

        return new LocalEbaySessionDto(
            authState.Environment,
            authState.MarketplaceId,
            tokenCipher.Unprotect(authState.AccessTokenCipher ?? throw new InvalidOperationException("Missing access token.")),
            tokenCipher.Unprotect(authState.RefreshTokenCipher ?? throw new InvalidOperationException("Missing refresh token.")),
            authState.AccessTokenExpiresAtUtc ?? DateTimeOffset.UtcNow,
            authState.RefreshTokenExpiresAtUtc,
            authState.Scope,
            authState.TokenType,
            authState.EbayUserId,
            authState.EbayUsername,
            authState.AccountType,
            authState.SellerRegistrationCompleted,
            null,
            null,
            null,
            null);
    }

    public async Task<LocalEbaySessionDto> RefreshAsync(LocalEbayRefreshRequest request, CancellationToken cancellationToken)
    {
        var environment = environmentResolver.Resolve(request.Environment);
        var tokenResponse = await gateway.RefreshAccessTokenAsync(environment, request.RefreshToken, integrationOptions.Value.Scopes, cancellationToken);
        var accessToken = tokenResponse["access_token"]?.GetValue<string>() ?? throw new InvalidOperationException("eBay refresh response did not include an access token.");
        var refreshToken = tokenResponse["refresh_token"]?.GetValue<string>() ?? request.RefreshToken;
        var accessExpires = tokenResponse["expires_in"]?.GetValue<int?>() ?? 7200;
        var refreshExpires = tokenResponse["refresh_token_expires_in"]?.GetValue<int?>();
        var user = await gateway.GetUserAsync(environment, accessToken, cancellationToken);
        var privileges = await gateway.GetPrivilegesAsync(environment, accessToken, cancellationToken);

        return new LocalEbaySessionDto(
            environment.Name,
            string.IsNullOrWhiteSpace(request.MarketplaceId) ? "EBAY_US" : request.MarketplaceId!,
            accessToken,
            refreshToken,
            DateTimeOffset.UtcNow.AddSeconds(accessExpires),
            refreshExpires.HasValue ? DateTimeOffset.UtcNow.AddSeconds(refreshExpires.Value) : null,
            tokenResponse["scope"]?.GetValue<string>(),
            tokenResponse["token_type"]?.GetValue<string>(),
            user["userId"]?.GetValue<string>(),
            user["username"]?.GetValue<string>(),
            user["accountType"]?.GetValue<string>(),
            privileges["sellerRegistrationCompleted"]?.GetValue<bool?>(),
            request.DefaultPaymentPolicyId,
            request.DefaultReturnPolicyId,
            request.DefaultFulfillmentPolicyId,
            request.DefaultLocationKey);
    }

    private static string HashExchangeCode(string value)
        => Convert.ToHexString(SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(value))).ToLowerInvariant();

    private static string NormalizeCallbackUrl(string callbackUrl)
    {
        if (!Uri.TryCreate(callbackUrl, UriKind.Absolute, out var parsed))
        {
            throw new InvalidOperationException("The local eBay callback URL is invalid.");
        }

        if (!(parsed.Scheme.Equals(Uri.UriSchemeHttp, StringComparison.OrdinalIgnoreCase) ||
              parsed.Scheme.Equals(Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase)))
        {
            throw new InvalidOperationException("The local eBay callback URL must use http or https.");
        }

        if (!parsed.Host.Equals("127.0.0.1", StringComparison.OrdinalIgnoreCase) &&
            !parsed.Host.Equals("localhost", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("The local eBay callback URL must point to localhost.");
        }

        return parsed.ToString();
    }
}
