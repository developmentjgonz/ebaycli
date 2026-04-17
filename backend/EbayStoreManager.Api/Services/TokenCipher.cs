using Microsoft.AspNetCore.DataProtection;

namespace EbayStoreManager.Api.Services;

public sealed class TokenCipher(IDataProtectionProvider dataProtectionProvider)
{
    private readonly IDataProtector _protector = dataProtectionProvider.CreateProtector("EbayStoreManager.Api.Tokens.v1");

    public string Protect(string value) => _protector.Protect(value);

    public string Unprotect(string value) => _protector.Unprotect(value);
}
