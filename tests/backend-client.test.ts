import { describe, expect, it, vi } from "vitest";

import { BackendApiClient } from "../src/backend-client.js";
import type { BackendProfile } from "../src/backend-types.js";
import { AppError } from "../src/errors.js";

const profile: BackendProfile = {
  name: "default",
  backendBaseUrl: "https://example.test",
  outputFormat: "json"
};

describe("BackendApiClient", () => {
  it("calls backend endpoints without local auth headers", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    const client = new BackendApiClient(profile, fetchMock as typeof fetch);
    await client.post("/api/local/ebay/authorize/start", {
      environment: "sandbox",
      callbackUrl: "http://127.0.0.1:8765/callback"
    });

    const [, init] = fetchMock.mock.calls[0] ?? [];
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBeNull();
    expect(headers.get("X-Api-Key")).toBeNull();
  });

  it("translates backend problem responses into AppError", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          title: "local_ebay_listing_get_failed",
          detail: "The listing could not be resolved."
        }),
        {
          status: 400,
          headers: { "content-type": "application/problem+json" }
        }
      )
    );

    const client = new BackendApiClient(profile, fetchMock as typeof fetch);

    await expect(client.post("/api/local/ebay/listings/get", {})).rejects.toMatchObject<AppError>({
      code: "VALIDATION_ERROR",
      message: "The listing could not be resolved."
    });
  });

  it("retries transient backend failures", async () => {
    let attempts = 0;
    const fetchMock = vi.fn(async () => {
      attempts += 1;
      if (attempts < 3) {
        return new Response("", { status: 503, headers: { "content-type": "text/plain" } });
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });

    const client = new BackendApiClient(profile, fetchMock as typeof fetch);
    const result = await client.get<{ ok: boolean }>("/api/local/ebay/status");

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("maps revoked or expired refresh-token failures to AUTH_REVOKED", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          title: "local_ebay_refresh_failed",
          detail: "eBay API request failed (400): {\"error\":\"invalid_grant\",\"error_description\":\"the provided authorization refresh token is invalid or was issued to another client\"}"
        }),
        {
          status: 400,
          headers: { "content-type": "application/problem+json" }
        }
      )
    );

    const client = new BackendApiClient(profile, fetchMock as typeof fetch);

    await expect(client.post("/api/local/ebay/refresh", {})).rejects.toMatchObject<AppError>({
      code: "AUTH_REVOKED"
    });
  });
});
