using System.Text.Json;

namespace EbayStoreManager.Api.Contracts;

public sealed record DoctorCheckDto(
    string Name,
    bool Ok,
    string Message,
    object? Details);

public sealed record DoctorReportDto(
    string StoreOwnerSlug,
    string Environment,
    IReadOnlyList<DoctorCheckDto> Checks);

public sealed record PolicySyncRequest(
    string? PaymentPolicyId,
    string? ReturnPolicyId,
    string? FulfillmentPolicyId,
    JsonElement? CreatePayload);

public sealed record LocationUpsertRequest(
    string? MerchantLocationKey,
    JsonElement? LocationPayload);
