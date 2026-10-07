import { RelayError } from "./responses";
import type { Env } from "./types";

export function publicBaseUrl(env: Env): string {
  try {
    const url = new URL(env.PUBLIC_BASE_URL ?? "");
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
        url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
      throw new Error("Invalid public origin");
    }
    return url.origin;
  } catch {
    throw new RelayError(503, "relay_not_configured", "PUBLIC_BASE_URL must be a public HTTPS origin, or a loopback HTTP origin for local development.");
  }
}

export function database(env: Env): D1Database {
  if (!env.AUTH_DB) {
    throw new RelayError(503, "relay_not_configured", "The AUTH_DB database binding is not configured.");
  }
  return env.AUTH_DB;
}
