# Cloudflare Worker OAuth relay

This optional TypeScript reference backend runs on Cloudflare Workers with D1. It provides the public HTTPS callback, OAuth token exchange/refresh, privacy/auth pages, and eBay notification endpoints required by a deployment-owned eBay integration.

The CLI remains the primary product: it stores the seller session locally and calls eBay directly for listing and seller setup workflows. Current CLI login and refresh require a compatible relay, but this particular Worker implementation is optional. No shared public app credentials or backend user-account service are provided.

Start with the [CLI README](../cli/README.md) if you already have a relay URL. Operators can use this page for local setup and the [deployment guide](../docs/deployment.md) for the complete public-host configuration.

The deployment starts restricted to configured seller IDs: use your own account first, and add invited sellers only when ready. The reference relay is not yet a complete public service for other sellers. Read [the hosting model](../docs/hosting-model.md) before onboarding them: notification POSTs currently acknowledge delivery without signed-event processing/deletion, and there is no hosted account or per-agent authorization layer.

## Local development

You need a current Node.js 22.13+ release and npm. Run from `backend/`:

```bash
npm ci
```

Copy [.dev.vars.example](.dev.vars.example) to `.dev.vars`. Keep the populated file local; it is ignored by Git. Replace `TOKEN_ENCRYPTION_KEY` with a base64-encoded 32-byte random key. This command generates one:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Paste the output into `.dev.vars`. Add the eBay credentials for the environment you intend to test and your account's immutable user ID in `ALLOWED_EBAY_USER_IDS`. Keep `SELLER_ACCESS_MODE=restricted`. Local Worker secrets are loaded from `.dev.vars` beside the Wrangler configuration. See [Cloudflare's secrets documentation](https://developers.cloudflare.com/workers/configuration/secrets/).

Apply the local schema and start the Worker:

```bash
npm run db:migrate:local
npm run dev
```

The development URL is `http://localhost:8787`. Local D1 data persists in Wrangler's local state directory and is separate from the deployed D1 database. [wrangler.jsonc](wrangler.jsonc) contains this deployment's D1 database ID. For a fork or separate deployment, create a database in your own Cloudflare account and replace that ID; do not reuse the original deployment's database configuration.

In another terminal:

```bash
curl http://localhost:8787/health
curl http://localhost:8787/ready
curl http://localhost:8787/privacy
curl http://localhost:8787/llms.txt
```

`/health` and public pages work without eBay credentials. `/ready` returns 503 until D1 is usable, the encryption key and public base URL are valid, at least one complete eBay environment is configured, and restricted access has a nonempty seller-ID allowlist. OAuth can remain inactive while those public pages are deployed. Readiness checks local dependencies and configuration, not whether eBay will accept your credentials or a seller account is ready to publish.

HTTP localhost is accepted for local development. Full eBay browser consent still needs the public HTTPS callback registered for your eBay application. Use a deployed relay with the intended hostname for live OAuth verification.

## Configuration

Non-secret defaults are in [wrangler.jsonc](wrangler.jsonc); local overrides/secrets belong in `.dev.vars`, and deployed secrets use Wrangler or the Cloudflare dashboard.

| Setting | Purpose |
| --- | --- |
| `AUTH_DB` | D1 binding for temporary OAuth state and encrypted handoff data |
| `TOKEN_ENCRYPTION_KEY` | Worker secret containing a base64-encoded 32-byte AES key |
| `PUBLIC_BASE_URL` | Stable public HTTPS origin, such as `https://your-relay.example.com`; no path, query, credentials, or fragment |
| `EBAY_SANDBOX_CLIENT_ID` / `EBAY_SANDBOX_CLIENT_SECRET` / `EBAY_SANDBOX_RUNAME` | Complete credential set for sandbox OAuth |
| `EBAY_PRODUCTION_CLIENT_ID` / `EBAY_PRODUCTION_CLIENT_SECRET` / `EBAY_PRODUCTION_RUNAME` | Complete credential set for production OAuth |
| `EBAY_NOTIFICATION_VERIFICATION_TOKEN` | Secret used for eBay notification endpoint challenges |
| `LEGAL_COMPANY_NAME` / `LEGAL_CONTACT_EMAIL` / `LEGAL_WEBSITE_URL` / `LEGAL_EFFECTIVE_DATE` | Deployment-specific public legal/page content; replace example defaults |
| `EBAY_SCOPES` | Optional whitespace-separated OAuth scope override |
| `SELLER_ACCESS_MODE` | `restricted` by default; `open` explicitly permits other eBay-resolved seller IDs |
| `ALLOWED_EBAY_USER_IDS` | Worker secret containing comma-separated immutable eBay commerce identity user IDs allowed in restricted mode |
| `AUTH_RATE_LIMITER` | Optional native Workers per-IP limiter for start, exchange, and refresh; configured to 20 requests per minute in the reference config |

Only configure an eBay environment you intend to enable. Keep the same encryption key across deployments while temporary handoffs are pending; replacing it prevents existing encrypted handoffs from being read. D1 does not serve as a permanent seller-session store: the CLI receives and stores the seller session after exchange.

### Seller access

An absent `SELLER_ACCESS_MODE` means `restricted`; unknown values fail closed. Restricted OAuth stays inactive when `ALLOWED_EBAY_USER_IDS` is empty. After eBay consent or refresh, the Worker reads the account's `userId` from the eBay Commerce Identity API and compares it exactly against the allowlist before returning any seller session. A username, caller-supplied ID, or first successful login cannot establish ownership. Denied login returns `seller_not_allowed` to the waiting CLI; denied refresh returns HTTP 403 with the same error title. The final one-time handoff also checks the current allowlist.

If you already have a working profile connected through a trusted relay, obtain its `ebayUserId` with:

```bash
ebay --profile YOUR_PROFILE auth status --json
```

Confirm that this is your account before adding the ID. The command contacts eBay and may refresh its session through the configured relay. If you do not yet have a working profile, use your own eBay developer app's User Token flow and a private client for the [Commerce Identity `getUser` endpoint](https://developer.ebay.com/api-docs/commerce/identity/resources/user/methods/getUser), then read `userId`. Keep tokens out of Git, model prompts, and shared logs. An unknown owner ID is required configuration; do not enable `open` or trust the first login to discover it.

Store the owner's ID as a Worker secret. Add sandbox/production owner IDs or later invited seller IDs as a comma-separated value when applicable:

```bash
npx wrangler secret put ALLOWED_EBAY_USER_IDS
```

Removing an ID blocks new handoffs and refreshes, but previously issued local access tokens can still call eBay until they expire or are revoked. Denying a login discards its token handoff; it does not revoke the consent already granted at eBay. Use eBay-side revocation when access must end immediately.

Explicit `SELLER_ACCESS_MODE=open` removes the seller-ID restriction. It does not establish eBay approval or readiness for a public service; review the [hosting model](../docs/hosting-model.md) before enabling it.

## D1 schema and deployment

The schema lives in [migrations/0001_auth.sql](migrations/0001_auth.sql). Use versioned migrations when changing it. The local and remote migration scripts call Wrangler with the `AUTH_DB` binding and explicit `--local` or `--remote` selection. See the [D1 command reference](https://developers.cloudflare.com/d1/wrangler-commands/).

For a new deployment, run from `backend/`:

```bash
npx wrangler login
npx wrangler d1 create ebaycli-relay-auth
```

For a new deployment or fork, replace this deployment's database ID with the returned ID in `d1_databases[0].database_id` in `wrangler.jsonc`. Keep the binding named `AUTH_DB`. Set `PUBLIC_BASE_URL` to your intended Worker HTTPS origin, retain `SELLER_ACCESS_MODE=restricted`, and replace the legal placeholders. Apply the remote schema, then create the initial Worker deployment:

```bash
npm run db:migrate:remote
npm run deploy
```

Until the keyset and allowed owner ID are set, public pages are available and OAuth stays inactive with `/ready` returning 503. Add the encryption key, owner-ID allowlist, and credentials for the enabled environment:

```bash
npx wrangler secret put TOKEN_ENCRYPTION_KEY
npx wrangler secret put ALLOWED_EBAY_USER_IDS
npx wrangler secret put EBAY_SANDBOX_CLIENT_ID
npx wrangler secret put EBAY_SANDBOX_CLIENT_SECRET
npx wrangler secret put EBAY_SANDBOX_RUNAME
npx wrangler secret put EBAY_NOTIFICATION_VERIFICATION_TOKEN
```

For production, use the corresponding `EBAY_PRODUCTION_*` secret names. Wrangler prompts for each secret's value; `.dev.vars` is not automatically uploaded. `wrangler secret put` immediately deploys a new Worker version. See [Cloudflare's deployed-secrets guidance](https://developers.cloudflare.com/workers/configuration/secrets/#secrets-on-deployed-workers).

Check `/ready` on the actual HTTPS host, then configure eBay and connect the CLI as described below. `npm run build` only bundles with `wrangler deploy --dry-run`; it does not publish. The commands above are deployment instructions, not evidence that this repository has been deployed.

## eBay URLs and CLI connection

For the application's RuName, register the public accepted/callback URL:

```text
https://your-relay.example.com/oauth/ebay/callback
```

Public landing and notification URLs:

```text
https://your-relay.example.com/privacy
https://your-relay.example.com/auth/success
https://your-relay.example.com/auth/declined
https://your-relay.example.com/notifications/ebay/marketplace-account-deletion
https://your-relay.example.com/notifications/ebay/authorization-revocation
```

Register the applicable notification endpoints with eBay and configure their verification token. Challenge hashes use `PUBLIC_BASE_URL`, so the configured origin must match the actual public endpoint hostname.

The verification token must contain 32–80 letters, digits, underscores, or hyphens and match the value entered in eBay's settings. See [eBay's notification setup guide](https://developer.ebay.com/develop/guides/sell/marketplace-user-account-deletion).

After the relay is configured and reachable, use an installed or locally built CLI:

```bash
ebay --profile sandbox config set --backend-url https://your-relay.example.com --json
ebay --profile sandbox auth login --environment sandbox --json
ebay --profile sandbox status --json
```

Login opens eBay consent and waits for the local CLI callback. The Worker exchanges the eBay authorization code and checks the eBay-resolved seller ID, then redirects an allowed account to the CLI with a one-time handoff code. The CLI exchanges it for the seller session. Pending OAuth states expire after 10 minutes and completed handoffs after 5 minutes. The reference cron runs cleanup every 30 minutes; expired rows are rejected even before cleanup runs.

When eBay returns a state to `/auth/declined`, the relay ends that pending login and redirects the browser to the CLI with a consent-denied error. Without a state, the endpoint shows its public declined page.

Use the [deployment guide](../docs/deployment.md) for hostname setup, production credentials, and live verification details.

## Moving from the previous .NET relay

Deploy the Worker with the same eBay app keyset and environment used by your existing CLI session, register its callback/notification URLs with eBay, and update the selected profile's relay URL:

```bash
ebay --profile YOUR_PROFILE config set --backend-url https://your-relay.example.com --json
ebay --profile YOUR_PROFILE status --json
```

Changing the relay URL preserves the local seller session and defaults. Add the existing account's immutable `ebayUserId` to the trusted Worker's allowlist before switching. Existing refresh tokens can continue through the Worker when the app keyset and environment match and the account is allowed; if they are rejected, inspect the configuration before reconnecting with `auth login` for that profile and environment. The local profile file path and session contract are unchanged.

No historical auth-state rows need to be copied from the previous database into D1. Start with the Worker migration and restart any browser login that was in progress during the switch. Previous backend listing/setup compatibility endpoints are retired; those operations run through the CLI's local eBay engine.

## HTTP interface

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Liveness |
| GET | `/ready` | D1 and relay configuration readiness, including seller-access configuration |
| GET | `/llms.txt` | Runtime relay discovery |
| GET | `/privacy`, `/privacy-policy` | Public privacy page |
| GET | `/auth/success`, `/auth/declined` | Public auth landing pages |
| GET | `/oauth/ebay/callback` | eBay OAuth callback |
| POST | `/api/local/ebay/authorize/start` | Begin OAuth; takes `environment`, local `callbackUrl`, optional `marketplaceId` |
| POST | `/api/local/ebay/authorize/exchange` | Consume the one-time handoff; takes `state` and `code` |
| POST | `/api/local/ebay/refresh` | Exchange a seller refresh token for an updated local-session response |
| GET / POST | `/notifications/ebay/marketplace-account-deletion` | Endpoint challenge / notification receipt |
| GET / POST | `/notifications/ebay/authorization-revocation` | Endpoint challenge / notification receipt |

Listing and seller setup operations belong to the CLI rather than this relay interface. The relay's exchange/refresh JSON contracts remain compatible with the CLI.

Notification POSTs acknowledge delivery with HTTP 204 and discard the payload. The relay has no permanent seller-account records and does not remove CLI profile files on users' machines. Local token refresh detects an expired or revoked grant when eBay rejects it.

## Tests and source navigation

```bash
npm run check
```

This runs type checking, automated tests, and a Wrangler deployment dry run. Automated tests and local smoke checks do not confirm a live Cloudflare deployment, registered eBay callbacks, browser consent, or production account readiness. See [TESTING.md](../TESTING.md) for that verification split and the [code map](../docs/code-map.md) for source navigation.

The Worker entrypoint is [src/index.ts](src/index.ts), persistence changes belong in [migrations](migrations), and the runtime configuration is [wrangler.jsonc](wrangler.jsonc). The backend package is private and is deployed as a Worker rather than published as an npm product.
