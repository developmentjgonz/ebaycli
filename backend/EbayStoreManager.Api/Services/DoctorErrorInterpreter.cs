using EbayStoreManager.Api.Contracts;

namespace EbayStoreManager.Api.Services;

public static class DoctorErrorInterpreter
{
    private const string BusinessPolicyEligibilityText = "User is not eligible for Business Policy";

    public static bool TryBuildBusinessPolicyChecks(Exception exception, out IReadOnlyList<DoctorCheckDto> checks)
    {
        if (!ContainsBusinessPolicyEligibilityFailure(exception))
        {
            checks = [];
            return false;
        }

        var details = new
        {
            exception.Message
        };

        checks =
        [
            new DoctorCheckDto("paymentPolicies", false, "Account is not eligible for eBay Business Policies.", details),
            new DoctorCheckDto("fulfillmentPolicies", false, "Account is not eligible for eBay Business Policies.", details),
            new DoctorCheckDto("returnPolicies", false, "Account is not eligible for eBay Business Policies.", details)
        ];

        return true;
    }

    private static bool ContainsBusinessPolicyEligibilityFailure(Exception exception)
        => exception.Message.Contains(BusinessPolicyEligibilityText, StringComparison.OrdinalIgnoreCase) ||
           exception.InnerException is not null && ContainsBusinessPolicyEligibilityFailure(exception.InnerException);
}
