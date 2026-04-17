import { AppError } from "./errors.js";
import { type BackendProfile } from "./backend-types.js";

export type FetchLike = typeof fetch;

export class BackendApiClient {
  private static readonly MaxAttempts = 3;
  private readonly fetchImpl: FetchLike;

  public constructor(
    private readonly profile: BackendProfile,
    fetchImpl?: FetchLike
  ) {
    this.fetchImpl = fetchImpl ?? fetch;
  }

  public async get<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
    const url = this.buildUrl(path, params);
    return this.request<T>(url, { method: "GET" });
  }

  public async post<T>(path: string, body?: unknown, params?: Record<string, string | number | undefined>): Promise<T> {
    const url = this.buildUrl(path, params);
    return this.request<T>(url, {
      method: "POST",
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
  }

  private buildUrl(path: string, params?: Record<string, string | number | undefined>): string {
    const base = this.profile.backendBaseUrl.endsWith("/")
      ? this.profile.backendBaseUrl.slice(0, -1)
      : this.profile.backendBaseUrl;
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const url = new URL(`${base}${normalizedPath}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    return url.toString();
  }

  private async request<T>(url: string, init: RequestInit): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    if (init.body !== undefined) {
      headers.set("Content-Type", "application/json");
    }

    let lastError: unknown;
    for (let attempt = 1; attempt <= BackendApiClient.MaxAttempts; attempt += 1) {
      try {
        const response = await this.fetchImpl(url, {
          ...init,
          headers
        });

        const payload = await parseResponsePayload(response);
        if (!response.ok) {
          const error = toAppError(response.status, payload);
          if (attempt < BackendApiClient.MaxAttempts && shouldRetry(response.status, init.method)) {
            await sleep(backoffMs(attempt));
            continue;
          }
          throw error;
        }

        return payload as T;
      } catch (error) {
        lastError = error;
        if (attempt >= BackendApiClient.MaxAttempts || error instanceof AppError) {
          throw error;
        }

        await sleep(backoffMs(attempt));
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new AppError("BACKEND_ERROR", "The service is unavailable.");
  }
}

async function parseResponsePayload(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return { ok: true };
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return await response.json();
  }

  const text = await response.text();
  if (!text) {
    return { ok: true };
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function toAppError(status: number, payload: unknown): AppError {
  if (isRecord(payload)) {
    const title = typeof payload.title === "string" ? payload.title : undefined;
    const detail = typeof payload.detail === "string" ? payload.detail : undefined;
    const message = detail ?? title ?? `Backend request failed with status ${status}.`;
    if (looksLikeRevokedAuth(message)) {
      return new AppError(
        "AUTH_REVOKED",
        "Your eBay authorization is no longer valid. Revoke access in My eBay if needed, then run `ebay auth login` again.",
        payload,
        2
      );
    }
    return new AppError(status === 400 ? "VALIDATION_ERROR" : "BACKEND_ERROR", message, payload, status >= 500 ? 1 : 2);
  }

  if (typeof payload === "string" && payload.length > 0) {
    if (looksLikeRevokedAuth(payload)) {
      return new AppError(
        "AUTH_REVOKED",
        "Your eBay authorization is no longer valid. Revoke access in My eBay if needed, then run `ebay auth login` again.",
        payload,
        2
      );
    }
    return new AppError("BACKEND_ERROR", payload, payload, status >= 500 ? 1 : 2);
  }

  return new AppError("BACKEND_ERROR", `Backend request failed with status ${status}.`, payload, status >= 500 ? 1 : 2);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function looksLikeRevokedAuth(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("invalid_grant") ||
    normalized.includes("revoked") ||
    normalized.includes("error code 16110") ||
    normalized.includes("error code 17470");
}

function shouldRetry(status: number, method?: string): boolean {
  const normalizedMethod = (method ?? "GET").toUpperCase();
  return status >= 500 && (normalizedMethod === "GET" || normalizedMethod === "POST");
}

function backoffMs(attempt: number): number {
  return 250 * attempt;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
