// Build both packages first. This check uses only synthetic sellers, a temporary
// CLI config directory, in-memory SQLite, and mocked eBay responses.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import worker from "../backend/dist/index.js";
import { runCli } from "../cli/dist/cli.js";
import { getProfile, upsertProfile } from "../cli/dist/profile-config.js";

const sqlite = new DatabaseSync(":memory:");
sqlite.exec(readFileSync(new URL("../backend/migrations/0001_auth.sql", import.meta.url), "utf8"));
const configHome = mkdtempSync(join(tmpdir(), "ebaycli-integration-"));
const originalConfigHome = process.env.XDG_CONFIG_HOME;
const originalExitCode = process.exitCode;
const nativeFetch = globalThis.fetch;
const stdoutWrite = process.stdout.write;
const stderrWrite = process.stderr.write;
process.env.XDG_CONFIG_HOME = configHome;

function statement(sql, values = []) {
  return {
    bind: (...next) => statement(sql, next),
    async first() { return sqlite.prepare(sql).get(...values) ?? null; },
    async run() {
      const result = sqlite.prepare(sql).run(...values);
      return { success: true, results: [], meta: { changes: Number(result.changes) } };
    }
  };
}

const env = {
  AUTH_DB: { prepare: sql => statement(sql) },
  ALLOWED_EBAY_USER_IDS: "seller-a,seller-b",
  TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64"),
  EBAY_SANDBOX_CLIENT_ID: "integration-client",
  EBAY_SANDBOX_CLIENT_SECRET: "integration-secret",
  EBAY_SANDBOX_RUNAME: "integration-runame"
};
const relay = createServer(async (request, response) => {
  try {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const result = await worker.fetch(new Request(`${env.PUBLIC_BASE_URL}${request.url}`, {
      method: request.method,
      headers: request.headers,
      ...(["GET", "HEAD"].includes(request.method) ? {} : { body: Buffer.concat(chunks) })
    }), env);
    response.writeHead(result.status, Object.fromEntries(result.headers));
    response.end(Buffer.from(await result.arrayBuffer()));
  } catch {
    response.writeHead(500);
    response.end("Integration relay failed.");
  }
});

let browserTask;
let seller;
let output = "";
const grants = [];
const externalRequests = [];
const tokenRequests = [];
const serverErrors = [];

try {
  await new Promise(resolve => relay.listen(0, "127.0.0.1", resolve));
  env.PUBLIC_BASE_URL = `http://127.0.0.1:${relay.address().port}`;
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.origin === env.PUBLIC_BASE_URL || url.hostname === "127.0.0.1") {
      return nativeFetch(request);
    }
    assert.ok(["api.sandbox.ebay.com", "apiz.sandbox.ebay.com"].includes(url.hostname), "Unexpected external host");
    externalRequests.push({ method: request.method, path: url.pathname });
    if (url.pathname === "/identity/v1/oauth2/token") {
      const form = new URLSearchParams(await request.text());
      const identity = form.get("grant_type") === "authorization_code"
        ? form.get("code")?.replace("code-", "")
        : form.get("refresh_token")?.replace("refresh-", "");
      assert.ok(["seller-a", "seller-b"].includes(identity), "Unknown synthetic seller");
      tokenRequests.push({ identity, grantType: form.get("grant_type") });
      return Response.json({
        access_token: `access-${identity}`, refresh_token: `refresh-${identity}`,
        expires_in: 7200, refresh_token_expires_in: 86400,
        token_type: "Bearer", scope: "https://api.ebay.com/oauth/api_scope"
      });
    }
    assert.equal(request.method, "GET", "The integration check must never mutate a seller account");
    const identity = request.headers.get("Authorization")?.replace("Bearer access-", "");
    assert.ok(["seller-a", "seller-b"].includes(identity), "Seller token was mixed up");
    if (url.pathname.replace(/\/$/, "") === "/commerce/identity/v1/user") {
      return Response.json({ userId: identity, username: identity, accountType: "BUSINESS" });
    }
    assert.equal(url.pathname, "/sell/account/v1/privilege", "Unexpected eBay request");
    return Response.json({ sellerRegistrationCompleted: true });
  };

  process.stdout.write = chunk => { output += String(chunk); return true; };
  process.stderr.write = chunk => {
    const consent = String(chunk).match(/https:\/\/auth\.sandbox\.ebay\.com\/oauth2\/authorize\?[^\s]+/);
    if (consent && seller) {
      const state = new URL(consent[0]).searchParams.get("state");
      browserTask = (async () => {
        const callback = await nativeFetch(`${env.PUBLIC_BASE_URL}/oauth/ebay/callback?state=${state}&code=code-${seller}`, { redirect: "manual" });
        assert.equal(callback.status, 302);
        const location = callback.headers.get("Location");
        const exchangeCode = new URL(location).searchParams.get("code");
        assert.ok(exchangeCode);
        grants.push({ state, code: exchangeCode });
        const delivered = await nativeFetch(location);
        assert.equal(delivered.status, 200);
        await delivered.text();
      })().catch(error => { serverErrors.push(error); });
    }
    return true;
  };

  async function command(profile, args) {
    output = "";
    await runCli(["node", "ebay", "--profile", profile, ...args, "--json"]);
    assert.equal(process.exitCode, originalExitCode, "CLI reported a command failure");
    return JSON.parse(output);
  }

  for (seller of ["seller-a", "seller-b"]) {
    await command(seller, ["config", "set", "--backend-url", env.PUBLIC_BASE_URL]);
    const connected = await command(seller, ["auth", "login", "--environment", "sandbox", "--no-open", "--timeout-seconds", "5"]);
    await browserTask;
    assert.deepEqual(serverErrors, []);
    assert.equal(connected.connection.ebayUserId, seller);
    assert.equal(connected.connection.accessToken, "***redacted***");
    assert.equal(connected.connection.refreshToken, "***redacted***");
    assert.equal(getProfile(seller).ebaySession.accessToken, `access-${seller}`);
    assert.equal((await command(seller, ["auth", "status"])).ebayUserId, seller);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM auth_states").get().count, 0, "Exchanged state retained seller tokens");
  }
  seller = undefined;

  const first = getProfile("seller-a");
  upsertProfile({ name: first.name, ebaySession: {
    ...first.ebaySession, accessTokenExpiresAtUtc: "2000-01-01T00:00:00.000Z", defaultLocationKey: "seller-a-location"
  } });
  assert.equal((await command("seller-a", ["auth", "status"])).ebayUserId, "seller-a");
  assert.equal(getProfile("seller-a").ebaySession.defaultLocationKey, "seller-a-location");
  assert.equal(getProfile("seller-b").ebaySession.refreshToken, "refresh-seller-b");
  assert.ok(tokenRequests.some(request => request.identity === "seller-a" && request.grantType === "refresh_token"));

  for (const grant of grants) {
    const replay = await nativeFetch(`${env.PUBLIC_BASE_URL}/api/local/ebay/authorize/exchange`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(grant)
    });
    assert.equal(replay.status, 400, "An exchange code could be reused");
  }
  assert.ok(externalRequests.length > 0);
} finally {
  globalThis.fetch = nativeFetch;
  process.stdout.write = stdoutWrite;
  process.stderr.write = stderrWrite;
  process.exitCode = originalExitCode;
  if (originalConfigHome === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = originalConfigHome;
  if (relay.listening) await new Promise(resolve => relay.close(resolve));
  sqlite.close();
  rmSync(configHome, { recursive: true, force: true });
}

console.log("Integration passed: two isolated sellers, CLI → relay → mocked eBay → SQLite → loopback → CLI, redacted JSON, refresh, and exchange replay protection.");
