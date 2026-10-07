import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { promisify } from "node:util";

import { DEFAULT_CALLBACK_PORT } from "./constants.js";
import { AppError } from "./errors.js";
import type { CliProfile, LocalEbayAuthStartResponse, LocalEbaySession } from "./types.js";

const execFileAsync = promisify(execFile);

export function normalizeRelayUrl(value: string): string {
  try {
    const url = new URL(value);
    const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if ((url.protocol !== "https:" && !(loopback && url.protocol === "http:")) ||
        url.username || url.password || url.search || url.hash) throw new Error("Unsafe relay URL");
    return url.toString().replace(/\/+$/, "");
  } catch {
    throw new AppError("CONFIG_ERROR", "The relay URL must use HTTPS (HTTP is allowed only on localhost or 127.0.0.1), without credentials, a query, or a fragment.");
  }
}

export async function beginLocalEbayAuthorization(
  profile: CliProfile,
  request: { environment: string; callbackUrl: string; marketplaceId?: string }
): Promise<LocalEbayAuthStartResponse> {
  return await postRelayJson<LocalEbayAuthStartResponse>(
    profile,
    "/api/local/ebay/authorize/start",
    {
      environment: request.environment,
      callbackUrl: request.callbackUrl,
      marketplaceId: request.marketplaceId ?? "EBAY_US"
    }
  );
}

export async function exchangeLocalEbayAuthorization(
  profile: CliProfile,
  request: { state: string; code: string }
): Promise<LocalEbaySession> {
  return await postRelayJson<LocalEbaySession>(
    profile,
    "/api/local/ebay/authorize/exchange",
    request
  );
}

export async function refreshLocalEbaySession(profile: CliProfile, session: LocalEbaySession): Promise<LocalEbaySession> {
  return await postRelayJson<LocalEbaySession>(
    profile,
    "/api/local/ebay/refresh",
    {
      environment: session.environment,
      marketplaceId: session.marketplaceId,
      refreshToken: session.refreshToken,
      refreshTokenExpiresAtUtc: session.refreshTokenExpiresAtUtc,
      defaultPaymentPolicyId: session.defaultPaymentPolicyId,
      defaultReturnPolicyId: session.defaultReturnPolicyId,
      defaultFulfillmentPolicyId: session.defaultFulfillmentPolicyId,
      defaultLocationKey: session.defaultLocationKey
    }
  );
}

export async function authenticateWithEbayLocally(
  profile: CliProfile,
  options: { environment: string; marketplaceId?: string; shouldOpen?: boolean; timeoutMs?: number }
): Promise<{ session: LocalEbaySession; authorize: LocalEbayAuthStartResponse; opened: boolean; callbackUrl: string }> {
  const callback = await startBrowserCallbackServer(DEFAULT_CALLBACK_PORT);
  try {
    const authorize = await beginLocalEbayAuthorization(profile, {
      environment: options.environment,
      callbackUrl: callback.callbackUrl,
      marketplaceId: options.marketplaceId
    });
    const opened = options.shouldOpen === false ? false : await openBrowser(authorize.authorizeUrl);
    if (!opened) {
      process.stderr.write(`Open this URL in a browser on this machine to connect eBay:\n${authorize.authorizeUrl}\n`);
    }
    const result = await callback.waitForResult(options.timeoutMs ?? 180_000);
    if (result.error) {
      throw new AppError("BACKEND_ERROR", result.error);
    }
    if (result.state !== authorize.state) {
      throw new AppError("OAUTH_STATE_MISMATCH", "eBay authorization returned an unexpected state token.");
    }
    if (!result.code) {
      throw new AppError("AUTH_CODE_MISSING", "eBay authorization completed without an exchange code.");
    }

    return {
      session: await exchangeLocalEbayAuthorization(profile, { state: authorize.state, code: result.code }),
      authorize,
      opened,
      callbackUrl: callback.callbackUrl
    };
  } finally {
    await callback.close();
  }
}

async function postRelayJson<T>(profile: CliProfile, path: string, payload: unknown): Promise<T> {
  if (!profile.backendBaseUrl) {
    throw new AppError("CONFIG_ERROR", "A backend URL is required for backend-assisted auth relay.");
  }
  const baseUrl = normalizeRelayUrl(profile.backendBaseUrl);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(payload),
      redirect: "manual",
      signal: AbortSignal.timeout(40_000)
    });
  } catch {
    throw new AppError("BACKEND_ERROR", "The auth relay could not be reached. Check its URL and availability, then retry.");
  }
  if (response.status >= 300 && response.status < 400) {
    throw new AppError("BACKEND_ERROR", "The auth relay redirected the request. Configure its final HTTPS endpoint with `ebay config set --backend-url URL` before retrying.");
  }

  const contentType = response.headers.get("content-type") ?? "";
  const mediaType = contentType.split(";")[0]?.trim().toLowerCase();
  const body = (mediaType === "application/json" || mediaType?.endsWith("+json"))
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const title = typeof body === "object" && body !== null && "title" in body && typeof body.title === "string"
      ? body.title
      : "";
    const detail = typeof body === "object" && body !== null && "detail" in body && typeof body.detail === "string"
      ? body.detail
      : typeof body === "string" && body.length > 0
        ? body
        : `Backend request failed with status ${response.status}.`;
    if (response.status === 401 || title === "local_ebay_auth_revoked" || title === "local_ebay_reauth_required") {
      const nextCommands = reconnectCommands(profile, payload);
      throw new AppError(
        "AUTH_REVOKED",
        `${detail} Run \`${nextCommands[0]}\` to reconnect.`,
        {
          backendStatus: response.status,
          backendTitle: title,
          backend: body,
          nextCommands
        }
      );
    }
    throw new AppError("BACKEND_ERROR", detail, body);
  }

  return body as T;
}

export function reconnectCommands(profile: CliProfile, payload: unknown): string[] {
  const requested = typeof payload === "object" && payload !== null && "environment" in payload
    ? payload.environment
    : undefined;
  const normalize = (value: unknown) => {
    const normalized = typeof value === "string" ? value.trim().toLowerCase() : undefined;
    return normalized === "sandbox" || normalized === "production" ? normalized : undefined;
  };
  const environment = normalize(requested) ?? normalize(profile.ebaySession?.environment) ?? "production";
  const selected = `ebay --profile ${quoteShellArgument(profile.name)}`;
  return [
    `${selected} auth login --environment ${environment} --json`,
    `${selected} status --json`
  ];
}

function quoteShellArgument(value: string): string {
  if (/^[A-Za-z0-9._-]+$/.test(value)) return value;
  // Single quotes prevent profile names from becoming shell expansions or commands.
  const escaped = process.platform === "win32" ? value.replaceAll("'", "''") : value.replaceAll("'", "'\\''");
  return `'${escaped}'`;
}

export async function openBrowser(url: string): Promise<boolean> {
  try {
    const launch = browserLaunchCommand(url);
    await execFileAsync(launch.command, launch.args);
    return true;
  } catch {
    return false;
  }
}

export function browserLaunchCommand(url: string, platform = process.platform): { command: string; args: string[] } {
  if (platform === "darwin") return { command: "open", args: [url] };
  if (platform !== "win32") return { command: "xdg-open", args: [url] };
  // Consent URLs contain & separators. Keep URL data out of cmd/PowerShell syntax.
  const encodedUrl = Buffer.from(url, "utf8").toString("base64");
  const script = `Start-Process -FilePath ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedUrl}')))`;
  return {
    command: "powershell.exe",
    args: ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")]
  };
}

async function startBrowserCallbackServer(preferredPort: number): Promise<{
  callbackUrl: string;
  waitForResult: (timeoutMs: number) => Promise<{ code?: string; state?: string; error?: string }>;
  close: () => Promise<void>;
}> {
  let resolveResult: ((value: { code?: string; state?: string; error?: string }) => void) | undefined;
  let rejectResult: ((reason?: unknown) => void) | undefined;
  const resultPromise = new Promise<{ code?: string; state?: string; error?: string }>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const code = url.searchParams.get("code") ?? undefined;
    const state = url.searchParams.get("state") ?? undefined;
    const error = url.searchParams.get("error_description") ?? url.searchParams.get("error") ?? undefined;

    response.statusCode = error ? 400 : 200;
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(`
      <html>
        <body style="font-family: sans-serif; padding: 2rem;">
          <h1>${error ? "Sign-in failed" : "Sign-in complete"}</h1>
          <p>${escapeHtml(error ?? "You can close this window and return to the CLI.")}</p>
        </body>
      </html>
    `);

    resolveResult?.({ code, state, error });
  });

  const listen = async (port: number) =>
    await new Promise<number>((resolvePort, reject) => {
      const onError = (error: Error) => {
        server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        server.off("error", onError);
        const address = server.address();
        resolvePort(typeof address === "object" && address ? address.port : port);
      };

      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(port, "127.0.0.1");
    });

  let port: number;
  try {
    port = await listen(preferredPort);
  } catch (error) {
    const errno = error as NodeJS.ErrnoException;
    if (errno.code !== "EADDRINUSE") {
      throw error;
    }

    port = await listen(0);
  }

  return {
    callbackUrl: `http://127.0.0.1:${port}/callback`,
    waitForResult: async (timeoutMs: number) => {
      const timer = setTimeout(() => {
        rejectResult?.(
          new AppError(
            "AUTH_CALLBACK_TIMEOUT",
            "Timed out waiting for eBay authorization to finish. Retry `ebay auth login` and complete the browser flow."
          )
        );
      }, timeoutMs);

      try {
        return await resultPromise;
      } finally {
        clearTimeout(timer);
      }
    },
    close: async () => {
      if (!server.listening) {
        return;
      }

      await new Promise<void>((resolveClose, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolveClose();
        });
      });
    }
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}
