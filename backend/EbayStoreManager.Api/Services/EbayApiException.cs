using System.Net;

namespace EbayStoreManager.Api.Services;

public sealed class EbayApiException(
    HttpStatusCode statusCode,
    string payload,
    string message) : InvalidOperationException(message)
{
    public HttpStatusCode StatusCode { get; } = statusCode;

    public string Payload { get; } = payload;

    public bool IsAuthorizationRevoked
    {
        get
        {
            var normalized = Payload.ToLowerInvariant();
            return StatusCode is HttpStatusCode.BadRequest or HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden &&
                   (normalized.Contains("invalid_grant", StringComparison.Ordinal) ||
                    normalized.Contains("invalid_token", StringComparison.Ordinal) ||
                    normalized.Contains("token expired", StringComparison.Ordinal) ||
                    normalized.Contains("revoked", StringComparison.Ordinal) ||
                    normalized.Contains("16110", StringComparison.Ordinal));
        }
    }
}
