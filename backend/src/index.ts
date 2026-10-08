import { NOTIFICATION_PATHS, acknowledgeNotification, notificationChallenge } from "./notifications";
import { cleanupExpiredStates, completeAuthorization, exchangeAuthorization, readiness, refreshAuthorization, startAuthorization } from "./oauth";
import { authLandingPage, authRecoveryPage, homePage, llmsText, privacyPage } from "./pages";
import { json, problem, RelayError } from "./responses";
import type { Env } from "./types";

export type { Env } from "./types";

type Handler = (request: Request, env: Env) => Response | Promise<Response>;

const POST_ROUTES: Record<string, Handler> = {
  "/api/local/ebay/authorize/start": startAuthorization,
  "/api/local/ebay/authorize/exchange": exchangeAuthorization,
  "/api/local/ebay/refresh": refreshAuthorization
};

const GET_ROUTES: Record<string, Handler> = {
  "/": (_request, env) => homePage(env),
  "/health": () => json({ status: "ok", utc: new Date().toISOString() }),
  "/ready": (_request, env) => readiness(env),
  "/llms.txt": () => llmsText(),
  "/privacy": (_request, env) => privacyPage(env),
  "/privacy-policy": (_request, env) => privacyPage(env),
  "/auth/success": (_request, env) => authLandingPage(env, true),
  "/auth/declined": (request, env) => new URL(request.url).searchParams.has("state")
    ? completeAuthorization(request, env, true)
    : authLandingPage(env, false),
  "/oauth/ebay/callback": completeAuthorization
};

async function route(request: Request, env: Env): Promise<Response> {
  const path = new URL(request.url).pathname;
  const post = POST_ROUTES[path];
  if (post) {
    if (request.method !== "POST") return methodNotAllowed("POST");
    if (env.AUTH_RATE_LIMITER) {
      const result = await env.AUTH_RATE_LIMITER.limit({ key: request.headers.get("CF-Connecting-IP") || "local" });
      if (!result.success) {
        const response = problem(429, "rate_limit_exceeded", "Too many requests. Slow down and try again shortly.");
        response.headers.set("Retry-After", "60");
        return response;
      }
    }
    return await post(request, env);
  }
  if (NOTIFICATION_PATHS.some(candidate => candidate === path)) {
    if (request.method === "GET") return await notificationChallenge(request, env);
    if (request.method === "POST") return acknowledgeNotification();
    return methodNotAllowed("GET, POST");
  }
  const get = GET_ROUTES[path];
  if (get) {
    if (request.method !== "GET") return methodNotAllowed("GET");
    return await get(request, env);
  }
  return problem(404, "route_not_found", "This relay provides OAuth and public eBay endpoints. Listing and setup workflows run in the CLI.");
}

function methodNotAllowed(allow: string): Response {
  const response = problem(405, "method_not_allowed", "This HTTP method is not supported for this route.");
  response.headers.set("Allow", allow);
  return response;
}

function isBrowserCallbackRequest(request: Request): boolean {
  if (request.method !== "GET") return false;
  const url = new URL(request.url);
  return url.pathname === "/oauth/ebay/callback" ||
    (url.pathname === "/auth/declined" && url.searchParams.has("state"));
}

function acceptsHtml(request: Request): boolean {
  return request.headers.get("Accept")?.split(",").some(value => {
    const [mediaType, ...parameters] = value.split(";");
    if (mediaType?.trim().toLowerCase() !== "text/html") return false;
    const quality = parameters.find(parameter => /^\s*q\s*=/i.test(parameter));
    return quality === undefined || Number(quality.slice(quality.indexOf("=") + 1).trim()) > 0;
  }) ?? false;
}

export default {
  async fetch(request: Request, env: Env, _ctx?: ExecutionContext): Promise<Response> {
    try {
      return await route(request, env);
    } catch (error) {
      if (error instanceof RelayError) {
        if (error.status === 400 && error.title === "local_ebay_authorize_exchange_failed" && isBrowserCallbackRequest(request)) {
          const response = acceptsHtml(request) ? authRecoveryPage() : problem(error.status, error.title, error.message);
          response.headers.set("Vary", "Accept");
          return response;
        }
        return problem(error.status, error.title, error.message);
      }
      // Do not serialize database errors, upstream bodies, request values, or tokens.
      return problem(500, "relay_error", "The relay could not complete the request. Verify the deployment configuration and try again.");
    }
  },
  async scheduled(_controller: ScheduledController, env: Env, _ctx?: ExecutionContext): Promise<void> {
    await cleanupExpiredStates(env);
  }
} satisfies ExportedHandler<Env>;
