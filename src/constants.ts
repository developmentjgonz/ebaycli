export const APP_NAME = "ebaycli";
export const DEFAULT_PROFILE = "default";
export const DEFAULT_MARKETPLACE_ID = "EBAY_US";
export const DEFAULT_CALLBACK_PORT = 8765;
export const DEFAULT_BACKEND_BASE_URL =
  process.env.EBAYCLI_BACKEND_URL ?? "https://ebaystore-validation-api-174140.azurewebsites.net";

export const EBAY_ENVIRONMENTS = {
  production: {
    authBaseUrl: "https://auth.ebay.com/oauth2",
    apiBaseUrl: "https://api.ebay.com",
    identityBaseUrl: "https://api.ebay.com/identity/v1"
  },
  sandbox: {
    authBaseUrl: "https://auth.sandbox.ebay.com/oauth2",
    apiBaseUrl: "https://api.sandbox.ebay.com",
    identityBaseUrl: "https://api.sandbox.ebay.com/identity/v1"
  }
} as const;

export const EBAY_SCOPES = [
  "https://api.ebay.com/oauth/api_scope",
  "https://api.ebay.com/oauth/api_scope/sell.account",
  "https://api.ebay.com/oauth/api_scope/sell.inventory",
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly"
];
