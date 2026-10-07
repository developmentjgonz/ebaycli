# Deploying the TypeScript relay to Cloudflare

The CLI runs on your machine. The optional reference backend runs directly on Cloudflare Workers, with D1 storing temporary OAuth handoffs. No ASP.NET runtime, Docker host, or tunnel is needed.

Workers supplies the HTTP runtime and secret bindings; D1 supplies the SQL state. This layout follows Cloudflare's [Workers configuration](https://developers.cloudflare.com/workers/wrangler/configuration/) and [D1 setup](https://developers.cloudflare.com/d1/get-started/) model.

The owner's [reference setup portal](https://ebaycli-relay.developmentjgonz.workers.dev) is deployed. Its OAuth is intentionally inactive pending the app credentials and permitted owner ID; it is not a shared public login service. Forks must create their own database and configure their own origin and secrets.

## Before you start

You need a Cloudflare account, a current Node.js 22.13+ release, and your own eBay developer app keyset. The backend is deployment-owned: do not treat this repository as a shared public credential broker. Start with your own seller account; the Worker defaults to restricted access by immutable seller ID.

Choose a stable HTTPS relay origin, such as `https://ebaycli-relay.<your-subdomain>.workers.dev` or a custom domain. The registered eBay endpoints and `PUBLIC_BASE_URL` must use that exact origin.

The Cloudflare pages can be deployed while OAuth remains inactive, pending your keyset and verified owner ID. Before inviting other sellers to use your app keyset, read the [hosting model](hosting-model.md). The reference relay does not yet process signed deletion notifications or provide hosted user accounts and per-agent approvals. Successful deployment and OAuth do not establish readiness for an unrestricted public service.

## 1. Install and prepare the database

From the repository root:

```bash
npm --prefix backend ci
npm --prefix backend run check
```

Then from `backend/`:

```bash
npx wrangler login
npx wrangler d1 create ebaycli-relay-auth
```

For a fork or separate deployment, put the returned database ID into the existing `AUTH_DB` entry in [wrangler.jsonc](../backend/wrangler.jsonc), replacing the original deployment's real database ID. Create and use a database in your own Cloudflare account. Keep one binding named `AUTH_DB`; if Wrangler offers to update configuration automatically, inspect the result for duplicate entries. Operators continuing the existing deployment should use its existing database rather than create a replacement.

Apply the schema to that deployed D1 database:

```bash
npm run db:migrate:remote
```

This writes only temporary OAuth-state tables. D1 migrations are described in [Cloudflare's migration reference](https://developers.cloudflare.com/d1/reference/migrations/).

## 2. Configure origin and legal text

In `wrangler.jsonc`, set:

| Variable | Value |
| --- | --- |
| `PUBLIC_BASE_URL` | Exact public HTTPS origin, with no path or query |
| `SELLER_ACCESS_MODE` | Keep `restricted` for your account and later invited sellers |
| `LEGAL_COMPANY_NAME` | Your deployment/operator name |
| `LEGAL_CONTACT_EMAIL` | Your privacy contact |
| `LEGAL_WEBSITE_URL` | Your site URL |
| `LEGAL_EFFECTIVE_DATE` | The date your policy takes effect |

Review the generated `/privacy` page for your actual deployment and replace or extend its content as needed. The sample text is not a complete operator-specific privacy policy.

Create the initial Worker deployment from `backend/`:

```bash
npm run deploy
```

Static pages are available at this point; OAuth stays inactive and `/ready` remains 503 until the keyset, encryption key, and nonempty owner-ID allowlist below are configured.

## 3. Add secrets

Generate a random 32-byte encryption key locally:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Store that value using Wrangler's secret prompt:

```bash
npx wrangler secret put TOKEN_ENCRYPTION_KEY
npx wrangler secret put ALLOWED_EBAY_USER_IDS
npx wrangler secret put EBAY_SANDBOX_CLIENT_ID
npx wrangler secret put EBAY_SANDBOX_CLIENT_SECRET
npx wrangler secret put EBAY_SANDBOX_RUNAME
npx wrangler secret put EBAY_NOTIFICATION_VERIFICATION_TOKEN
```

For production, also configure `EBAY_PRODUCTION_CLIENT_ID`, `EBAY_PRODUCTION_CLIENT_SECRET`, and `EBAY_PRODUCTION_RUNAME`. You only need credentials for the environments your deployment serves.

Check that the app keyset can request the default base, seller account, inventory, and `commerce.identity.readonly` scopes. The relay needs a successful identity lookup to enforce seller restrictions; configuration readiness alone does not verify eBay API access. Consult [eBay's scope-controlled Identity guidance](https://developer.ebay.com/develop/guides/sell/other-apis-guide) if the app cannot obtain that scope.

Each `wrangler secret put` prompts for a value and deploys an updated Worker version. Local `.dev.vars` contents are not uploaded automatically.

For `ALLOWED_EBAY_USER_IDS`, enter the immutable Commerce Identity user ID for your own eBay account. This is not the account username, app client ID, or a listing ID. If you already have a working CLI profile on a trusted relay, inspect its eBay-resolved `ebayUserId`:

```bash
ebay --profile YOUR_PROFILE auth status --json
```

That command contacts eBay and can refresh through the profile's configured relay. Confirm it is your account. If no working profile exists, obtain a User access token for your own account through your eBay developer application's token flow and privately call the [Commerce Identity `getUser` endpoint](https://developer.ebay.com/api-docs/commerce/identity/resources/user/methods/getUser) to read `userId`. Keep the token out of Git, model prompts, and shared logs. Until the ID is known, leave OAuth inactive; do not enable open access or trust the first login as the owner.

Use a comma-separated secret value for multiple verified IDs, such as your sandbox and production accounts or later invited sellers. The Worker compares IDs exactly against the identity returned by eBay during login and refresh. Removing an ID blocks future handoffs and refreshes; already-issued access tokens remain usable until expiry or eBay-side revocation.

The default `restricted` mode also applies when `SELLER_ACCESS_MODE` is absent. An empty allowlist or unrecognized mode fails closed. Setting `SELLER_ACCESS_MODE=open` explicitly bypasses the ID restriction; it does not establish eBay approval or public launch readiness. See the [hosting model](hosting-model.md) before making that change.

Use a notification verification token of 32–80 characters containing only letters, digits, underscores, or hyphens, and enter the same value in eBay's notification settings. See [eBay's notification setup guide](https://developer.ebay.com/develop/guides/sell/marketplace-user-account-deletion).

Keep the encryption key stable across deployments. Changing it invalidates encrypted handoffs still in progress; begin a fresh login after rotation. Never put real secrets in `wrangler.jsonc`, Git history, or issue reports. See [Cloudflare Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/).

## 4. Register eBay endpoints

In your eBay application's environment-specific redirect settings, configure:

| Setting | URL |
| --- | --- |
| OAuth accepted/callback | `https://<relay-origin>/oauth/ebay/callback` |
| Declined landing page | `https://<relay-origin>/auth/declined` |
| Privacy policy | `https://<relay-origin>/privacy` |
| Marketplace account deletion | `https://<relay-origin>/notifications/ebay/marketplace-account-deletion` |
| Authorization revocation, if enabled | `https://<relay-origin>/notifications/ebay/authorization-revocation` |

Use the corresponding eBay-issued RuName as the Worker secret. eBay's [authorization guide](https://developer.ebay.com/develop/guides/sell/authorization) explains the RuName and environment relationship.

If using a custom domain, configure its Worker routing in Cloudflare and verify that it matches `PUBLIC_BASE_URL`. Database creation, secrets, migrations, and deployment are operator actions; local checks do not perform them.

## 5. Verify and connect the CLI

Check the public service:

```bash
curl https://<relay-origin>/health
curl https://<relay-origin>/ready
curl https://<relay-origin>/privacy
curl https://<relay-origin>/llms.txt
```

`/ready` checks the relay's configuration and database readiness, including the seller-access mode and nonempty restricted allowlist; its response includes `sellerAccessMode` without listing allowed IDs. It does not perform live eBay token validation or establish seller readiness. A successful notification challenge also requires the configured verification token and exact public endpoint URL.

From the repository root, connect a sandbox profile:

```bash
node cli/dist/index.js --profile sandbox config set --backend-url https://<relay-origin> --json
node cli/dist/index.js --profile sandbox auth login --environment sandbox --json
node cli/dist/index.js --profile sandbox status --json
```

Complete consent with your allowed account in a browser on the machine running the CLI. An account outside the allowlist receives `seller_not_allowed` without a token handoff. Denial discards the relay's token handoff; it does not revoke the grant already consented to at eBay. Once the account is ready, use its listing commands normally.

## Local development

From `backend/`:

```bash
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

Populate `.dev.vars` with a generated encryption key, your sandbox credentials, and the sandbox account's immutable ID in `ALLOWED_EBAY_USER_IDS` when testing OAuth. Keep `SELLER_ACCESS_MODE=restricted`. Local static pages work without eBay credentials or an owner ID. The local service listens at `http://localhost:8787`.

A local Worker alone does not provide the public HTTPS callback registered with eBay. Automated tests simulate that flow; test real consent against your deployed HTTPS relay.

## Operations and migration

The scheduled job deletes expired auth state every 30 minutes. Consumed handoffs are deleted immediately; do not use D1 as a long-term seller session store. Tokens in temporary handoffs are encrypted at rest in application storage; deployment secrets remain in Worker secret bindings.

The native rate-limit binding covers OAuth start, exchange, and refresh. It does not impose app-wide eBay budgets on local listing calls. Notification POSTs acknowledge delivery; they do not process deletion or remove profile files on users' machines. Monitor failures without logging tokens, authorization codes, or request bodies. See the [hosting model](hosting-model.md) for the remaining public-service responsibilities.

Existing CLI profile files remain compatible. Add their verified seller IDs to the new relay's allowlist, repoint them to that trusted relay using the same eBay app/environment, and restart any in-flight login. The former .NET listing/setup compatibility routes are retired because those workflows run in the CLI. See [architecture](agent-first-architecture.md) and [profiles](profiles.md).
