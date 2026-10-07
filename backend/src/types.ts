export interface Env {
  AUTH_DB: D1Database;
  AUTH_RATE_LIMITER?: RateLimit;
  TOKEN_ENCRYPTION_KEY?: string;
  PUBLIC_BASE_URL?: string;
  EBAY_SANDBOX_CLIENT_ID?: string;
  EBAY_SANDBOX_CLIENT_SECRET?: string;
  EBAY_SANDBOX_RUNAME?: string;
  EBAY_PRODUCTION_CLIENT_ID?: string;
  EBAY_PRODUCTION_CLIENT_SECRET?: string;
  EBAY_PRODUCTION_RUNAME?: string;
  EBAY_NOTIFICATION_VERIFICATION_TOKEN?: string;
  EBAY_SCOPES?: string;
  SELLER_ACCESS_MODE?: "restricted" | "open";
  ALLOWED_EBAY_USER_IDS?: string;
  LEGAL_COMPANY_NAME?: string;
  LEGAL_CONTACT_EMAIL?: string;
  LEGAL_WEBSITE_URL?: string;
  LEGAL_EFFECTIVE_DATE?: string;
}

export interface EbayEnvironment {
  name: "sandbox" | "production";
  clientId: string;
  clientSecret: string;
  ruName: string;
  authBaseUrl: string;
  apiBaseUrl: string;
  identityBaseUrl: string;
}

export interface LocalEbaySession {
  environment: string;
  marketplaceId: string;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAtUtc: string;
  refreshTokenExpiresAtUtc: string | null;
  scope: string | null;
  tokenType: string | null;
  ebayUserId: string | null;
  ebayUsername: string | null;
  accountType: string | null;
  sellerRegistrationCompleted: boolean | null;
  defaultPaymentPolicyId: string | null;
  defaultReturnPolicyId: string | null;
  defaultFulfillmentPolicyId: string | null;
  defaultLocationKey: string | null;
}

export interface AuthState {
  state: string;
  environment: "sandbox" | "production";
  marketplace_id: string;
  callback_url: string;
  status: "pending" | "processing" | "complete";
  created_at: number;
  expires_at: number;
  exchange_code_hash: string | null;
  session_cipher: string | null;
}
