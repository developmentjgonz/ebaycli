import { publicBaseUrl } from "./config";
import { SITE_SCRIPT, SITE_STYLES } from "./site";
import type { Env } from "./types";

export function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function website(env: Env): string {
  try {
    const url = new URL(env.LEGAL_WEBSITE_URL || env.PUBLIC_BASE_URL || "https://example.com");
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error();
    return url.toString().replace(/\/$/, "");
  } catch {
    return "https://example.com";
  }
}

function page(title: string, body: string, options: { site?: boolean; script?: string } = {}): Response {
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join("");
  return new Response(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style nonce="${nonce}">${options.site ? SITE_STYLES : 'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-width:52rem;margin:2rem auto;padding:0 1rem;line-height:1.6;color:#1f2937}h1,h2{line-height:1.25}code{background:#f3f4f6;padding:.15rem .35rem;border-radius:.25rem;overflow-wrap:anywhere}a{color:#1d4ed8}'}</style>
</head><body${options.site ? ' class="site"' : ""}>${body}${options.script ? `<script nonce="${nonce}">${options.script}</script>` : ""}</body></html>`, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": `default-src 'none'; style-src 'nonce-${nonce}'; ${options.script ? `script-src 'nonce-${nonce}'; connect-src 'self'; ` : ""}base-uri 'none'; frame-ancestors 'none'; form-action 'none'`,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer"
    }
  });
}

export function homePage(env: Env): Response {
  let origin = "";
  try { origin = publicBaseUrl(env); } catch { /* The setup page remains useful before configuration. */ }
  const relay = escapeHtml(origin || "https://YOUR-RELAY.example");
  const copyIcon = '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="7" y="7" width="9" height="10" rx="1.5"/><path d="M12 7V3H3v10h4"/></svg>';
  return page("ebaycli · Relay setup", `<a class="skip-link" href="#main">Skip to setup</a>
<div class="shell" data-relay-origin="${relay}">
<aside class="sidebar"><div><a class="brand" href="/" aria-label="ebaycli relay"><svg viewBox="0 0 28 28" fill="none" aria-hidden="true"><path d="M5 7h18M5 14h13M5 21h18" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>ebaycli</a><small>Your store. Your agent.</small></div>
<nav class="nav" aria-label="Setup navigation">
<a class="active" href="#connection"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5h14v10H3zM7 5v10"/></svg>Connection checks</a>
<a href="#grok"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 6 3 10l4 4m6-8 4 4-4 4m-2-10-2 16"/></svg>Connect Grok Bot</a>
<a href="#scope"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h8"/></svg>What it can manage</a>
<a class="external-nav" href="https://github.com/developmentjgonz/ebaycli/blob/codex/public-repo-cleanup/docs/deployment.md"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 3h9l3 3v11H4zM12 3v4h4M7 10h6M7 13h6"/></svg>Deployment guide</a>
</nav><div class="sidebar-foot"><strong>Own store first</strong>This is a setup portal for your deployment. Other seller onboarding is not available.</div></aside>
<main class="content" id="main"><div class="topline"><span class="platform"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 15h10a3 3 0 0 0 0-6 5 5 0 0 0-9-2 4 4 0 0 0-1 8Z"/></svg>Cloudflare relay</span><a href="https://github.com/developmentjgonz/ebaycli/tree/codex/public-repo-cleanup">View project</a></div>
<header class="page-head"><div><h1>Put your store in good hands.</h1><p>Check your relay, connect your eBay CLI, and give Grok Bot a clear starting point.</p></div><button class="button button-primary" id="copy-handoff" type="button">${copyIcon}<span>Copy Grok handoff</span></button></header>
<p class="feedback" id="copy-feedback" role="status" aria-live="polite"></p><div class="copy-fallback" id="copy-fallback" hidden><label for="copy-text">Copy this text into your Bot</label><textarea id="copy-text" readonly spellcheck="false"></textarea></div>
<noscript><p class="noscript">Live checks and copy buttons need JavaScript. You can still open <a href="/health">health</a> and <a href="/ready">readiness</a>, and select the commands below to copy them.</p></noscript>
<section class="check-panel" id="connection" aria-labelledby="connection-heading"><div class="section-head"><h2 id="connection-heading">Check your connection</h2><button class="button" id="retry-checks" type="button">Check again</button></div><p class="check-summary" id="check-summary" role="status" aria-live="polite">Checking the live service and OAuth configuration…</p>
<div class="check-list"><div class="check-row"><div><strong>Relay service</strong><small>Can this deployment respond?</small></div><span class="status" data-state="pending" id="health-status">Checking</span></div><div class="check-row"><div><strong>OAuth configuration</strong><small>App settings, encryption, and database</small></div><span class="status" data-state="pending" id="ready-status">Checking</span></div><div class="check-row"><div><strong>Seller access</strong><small>Who may use this relay?</small></div><span class="status" data-state="pending" id="access-status">Checking</span></div></div>
<div class="check-foot"><span><time id="last-checked">Not checked yet</time> · These checks do not verify your store.</span><a href="https://github.com/developmentjgonz/ebaycli/blob/codex/public-repo-cleanup/docs/deployment.md">Resolve setup issues</a></div>
${origin ? `<p class="deployment-url">${relay}</p>` : '<p class="notice">Set PUBLIC_BASE_URL to this deployment’s public HTTPS address before connecting. The commands below use a placeholder until then.</p>'}</section>
<section id="grok" aria-labelledby="grok-heading"><div class="setup-head"><div><h2 id="grok-heading">Connect your Grok Bot</h2><p>Use the dedicated Grok Bot’s cloud computer. The CLI and the browser completing consent must be on that same computer.</p></div><div class="field"><label for="environment">eBay environment</label><select id="environment"><option value="production">Production</option><option value="sandbox">Sandbox</option></select></div></div><p class="environment-note" id="environment-note">Checking which environments this relay has configured…</p>
<ol class="steps"><li class="step"><div><h3>Install on the Bot’s computer</h3><p>Ask Grok to clone the <code>codex/public-repo-cleanup</code> branch into <code>/workspace/ebaycli</code> and use a current Node.js 22+ release. The CLI is installed from source.</p><div class="command"><div class="command-top"><span>Run in the project checkout</span><button class="copy-small" type="button" data-copy-target="install-command" aria-label="Copy installation commands">Copy</button></div><pre><code id="install-command">npm --prefix /workspace/ebaycli/cli ci
npm --prefix /workspace/ebaycli/cli run build</code></pre></div><p class="note">Already have a checkout? Use it rather than cloning over existing files. The copied handoff includes that instruction.</p></div></li>
<li class="step"><div><h3>Authorize your eBay account</h3><p>Keep the login command running while Grok opens the consent link in its cloud browser. Take over that browser for your sign-in, verification, and consent.</p><div class="command"><div class="command-top"><span>eBay OAuth · seller consent</span><button class="copy-small" type="button" data-copy-target="connect-command" aria-label="Copy connection commands">Copy</button></div><pre><code id="connect-command">node /workspace/ebaycli/cli/dist/index.js --profile own-store config set --backend-url ${relay} --json
node /workspace/ebaycli/cli/dist/index.js --profile own-store auth login --environment production --no-open --timeout-seconds 600 --json</code></pre></div><p class="note">The consent URL appears in the command’s output. Keep passwords and tokens out of chat. This website never asks for them.</p></div></li>
<li class="step"><div><h3>Check the store, then prepare a plan</h3><p>These commands check the seller account and read its listings. The results stay in the CLI and Bot; this portal does not have a connected-store dashboard.</p><div class="command"><div class="command-top"><span>Account readiness · listing read</span><button class="copy-small" type="button" data-copy-target="store-command" aria-label="Copy store check commands">Copy</button></div><pre><code id="store-command">node /workspace/ebaycli/cli/dist/index.js --profile own-store status --json
node /workspace/ebaycli/cli/dist/index.js --profile own-store listings list --limit 5 --json</code></pre></div><p class="note">Review a create, update, or end plan before <code>--apply</code>. Policy creation, program opt-in, and location changes act immediately and also need your authorization.</p></div></li></ol></section>
<section class="scope" id="scope" aria-labelledby="scope-heading"><h2 id="scope-heading">A clear job for your agent</h2><p>Start with listing management. The relay handles login and refresh; your CLI runs seller operations directly against eBay.</p><div class="scope-grid"><div><h3>Available through the CLI</h3><ul><li>Read active and recently sold listings</li><li>Export drafts and prepare changes</li><li>Create, update, and end listings with reviewed plans</li><li>Check seller readiness, policies, and locations</li></ul></div><div class="unavailable"><h3>Not available through this project</h3><ul><li>Order fulfillment and shipping labels</li><li>Refunds, returns, and buyer messages</li><li>Other seller onboarding on this site</li><li>A hosted store dashboard or public agent connector</li></ul></div></div><p class="note">OAuth grants API access; it does not approve every later change. Agree on the Bot’s scope and any standing limits. Bots on your Grok account share their computer, files, and command-line credentials.</p></section>
<footer class="footer"><span>ebaycli relay · Seller sessions stay with the CLI.</span><div class="footer-links"><a href="/privacy">Privacy</a><a href="/llms.txt">Agent guide</a><a href="https://docs.x.ai/grok-bot/computer-and-apps">Grok Bot setup</a></div></footer></main></div>`, { site: true, script: SITE_SCRIPT });
}

export function privacyPage(env: Env): Response {
  const company = escapeHtml(env.LEGAL_COMPANY_NAME || "ebaycli Relay");
  const contact = env.LEGAL_CONTACT_EMAIL || "privacy@example.com";
  const site = website(env);
  return page(`${env.LEGAL_COMPANY_NAME || "ebaycli Relay"} Privacy Policy`, `<h1>${company} Privacy Policy</h1>
<p><strong>Effective date:</strong> ${escapeHtml(env.LEGAL_EFFECTIVE_DATE || "2026-10-06")}</p>
<p>This relay completes OAuth login and token refresh for a local eBay CLI and hosts the public privacy, auth, and notification endpoints required by the deployment.</p>
<h2>Information processed</h2>
<p>The relay processes eBay account identifiers, OAuth tokens, seller-registration status, and temporary authorization records needed to complete a requested login or refresh.</p>
<h2>How data is used</h2>
<p>Data is used to complete eBay authorization, refresh access when requested, and operate this relay. Listing and seller-setup workflows run locally in the CLI.</p>
<h2>How data is stored</h2>
<p>The CLI stores the seller session on the user's machine. This relay stores temporary login state in a Cloudflare D1 database. Temporary token material is encrypted with a deployment-owned key, and a successful one-time exchange removes its authorization record. Refresh requests do not create a persistent seller session on the relay.</p>
<h2>Data retention</h2>
<p>Pending login state expires after ten minutes; completed handoffs expire after five minutes. Expired records cannot be exchanged and are removed by scheduled cleanup. Hosting-provider request metadata may be retained according to the deployment's logging settings.</p>
<h2>Third-party services</h2>
<p>This deployment uses eBay APIs and Cloudflare Workers and D1. eBay data remains subject to eBay's rules and the permissions granted by the user.</p>
<h2>Your choices</h2>
<p>You can revoke access in your eBay account settings or disconnect the local CLI session. Notification endpoints acknowledge eBay notifications; this relay does not maintain a persistent seller-account store.</p>
<h2>Contact</h2>
<p>For privacy questions, contact <a href="mailto:${escapeHtml(contact)}">${escapeHtml(contact)}</a>.</p>
<p>Website: <a href="${escapeHtml(site)}">${escapeHtml(site)}</a></p>`);
}

export function authLandingPage(env: Env, accepted: boolean): Response {
  const title = accepted ? "Authorization complete" : "Authorization declined";
  const message = accepted
    ? "You can return to the CLI now and close this browser tab."
    : "The eBay consent flow was declined or canceled. You can close this page and retry the login command from the CLI when ready.";
  return page(title, `<h1>${title}</h1><p>${message}</p>
<p>Privacy: <a href="/privacy">Privacy policy</a></p>
<p>${escapeHtml(env.LEGAL_COMPANY_NAME || "ebaycli Relay")}</p>`);
}

export function llmsText(): Response {
  return new Response(`# ebaycli

ebaycli is a local eBay CLI with a deployment-owned Cloudflare Worker OAuth relay.

- The CLI stores seller sessions locally and calls eBay directly for listing and setup workflows.
- This reference relay owns deployment-specific eBay app credentials and server-side token exchange/refresh.
- It has no shared public account broker or persistent seller-account/store model.
- D1 stores temporary OAuth state; one-time handoffs are encrypted and expire within five minutes.
- It hosts public privacy/auth pages and eBay notification challenge/acknowledgment endpoints.

## Start here

- Health: /health
- Readiness: /ready
- Privacy: /privacy
- Auth success: /auth/success
- Auth declined: /auth/declined
- Project: https://github.com/developmentjgonz/ebaycli/tree/codex/public-repo-cleanup
- CLI documentation: https://github.com/developmentjgonz/ebaycli/blob/codex/public-repo-cleanup/cli/README.md
- Relay documentation: https://github.com/developmentjgonz/ebaycli/blob/codex/public-repo-cleanup/backend/README.md
- Deployment: https://github.com/developmentjgonz/ebaycli/blob/codex/public-repo-cleanup/docs/deployment.md
- Code map: https://github.com/developmentjgonz/ebaycli/blob/codex/public-repo-cleanup/docs/code-map.md

## Relay API

- POST /api/local/ebay/authorize/start: begin eBay consent and return a state-bound authorizeUrl
- GET /oauth/ebay/callback: exchange the eBay code server-side and redirect to the validated CLI loopback callback
- POST /api/local/ebay/authorize/exchange: redeem the one-time handoff code for the seller session
- POST /api/local/ebay/refresh: refresh a local seller session using this deployment's eBay credentials
- GET /notifications/ebay/marketplace-account-deletion: eBay verification challenge
- POST /notifications/ebay/marketplace-account-deletion: acknowledge a notification
- GET /notifications/ebay/authorization-revocation: eBay verification challenge
- POST /notifications/ebay/authorization-revocation: acknowledge a notification

Listing and setup API routes are not hosted here; use the local CLI for those operations.

## CLI commands

- ebay guide --json
- ebay config set --backend-url https://your-relay.example.com --json
- ebay auth login --environment production --json
- ebay auth status --json
- ebay setup doctor --json
- ebay listings list --json
- ebay listings get <reference> --json

## Agent guidance

Prefer the built-in machine-readable CLI guidance over repository inference:

- cd cli && node dist/index.js guide --json
- ebay guide capabilities --json
- ebay guide workflows --json
- ebay guide listing-spec --json
- ebay guide agent-notes --json
- ebay llms

Read the guide before drafting listing files or choosing between Trading/classic and Inventory API listing workflows. Listing writes are planned first; apply them only when the user authorizes the concrete result.
`, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
