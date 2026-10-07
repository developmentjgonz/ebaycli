import { publicBaseUrl } from "./config";
import { hashHex } from "./crypto";
import { json, RelayError } from "./responses";
import type { Env } from "./types";

export const NOTIFICATION_PATHS = [
  "/notifications/ebay/marketplace-account-deletion",
  "/notifications/ebay/authorization-revocation"
] as const;

export async function notificationChallenge(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("challenge_code");
  if (!code?.trim()) {
    throw new RelayError(400, "missing_challenge_code", "The 'challenge_code' query string parameter is required.");
  }
  if (!env.EBAY_NOTIFICATION_VERIFICATION_TOKEN?.trim()) {
    throw new RelayError(503, "notification_verification_token_missing", "The eBay notification verification token is not configured.");
  }
  const endpoint = `${publicBaseUrl(env)}${url.pathname}`;
  return json({ challengeResponse: await hashHex(`${code}${env.EBAY_NOTIFICATION_VERIFICATION_TOKEN}${endpoint}`) });
}

export function acknowledgeNotification(): Response {
  // The relay has no persistent seller-account store. Acknowledge without recording payload/token data.
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
