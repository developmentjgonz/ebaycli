# EbayStoreManager.Api

`EbayStoreManager.Api` is the reference backend relay for `ebaycli`.

Primary responsibilities:

- host public privacy and auth landing pages
- handle server-side OAuth callback and token exchange/refresh
- expose the marketplace account deletion webhook

The production CLI path uses this backend relay because eBay requires a public HTTPS redirect URL. The CLI still stores the resulting seller session locally and performs listing workflows locally.

## Local run

From `backend/`:

```bash
dotnet build EbayStoreManager.sln
dotnet test EbayStoreManager.sln
dotnet run --project EbayStoreManager.Api
```

Default local URLs come from [launchSettings.json](Properties/launchSettings.json):

- `http://localhost:5141`
- `https://localhost:7217`

Health check:

```bash
curl http://localhost:5141/health
```

Readiness check:

```bash
curl http://localhost:5141/ready
```

## Configuration model

Production-minded defaults:

- secrets are not checked into `appsettings.json`
- local development should use `.NET user-secrets` or environment variables
- production should use App Service settings, Key Vault, or equivalent server-side secret storage
- the checked-in `Legal` section contains generic placeholders and should be overridden for any real deployment

What is actually required:

- `ConnectionStrings:SqlServer` or `ConnectionStrings:Sqlite`
  - one database connection is required
  - local dev can use the checked-in SQLite default
  - production should typically use SQL Server
- `Ebay:Production:ClientId`, `Ebay:Production:ClientSecret`, `Ebay:Production:RuName`
  - required only if you want production OAuth/calls
- `Ebay:Sandbox:ClientId`, `Ebay:Sandbox:ClientSecret`, `Ebay:Sandbox:RuName`
  - required only if you want sandbox OAuth/calls
- `Ebay:Notifications:VerificationToken`
  - required only if you enable the marketplace account deletion notification challenge flow
- `Legal:CompanyName`, `Legal:ContactEmail`, `Legal:EffectiveDate`, `Legal:WebsiteUrl`
  - not required for the app to boot
  - required if you want the public privacy/auth pages to be production-credible
- `Operations:*`
  - optional tuning knobs
  - safe defaults already exist in `appsettings.json`

Settings that are intentionally not in the config surface anymore:

- no `PublicBaseUrl`
- no `CallbackPath`

Those values were unused by the runtime and were removed to keep the production config honest.

## Local secrets

Use `dotnet user-secrets` for local eBay credentials:

```bash
cd backend/EbayStoreManager.Api

dotnet user-secrets set "Ebay:Sandbox:ClientId" "..."
dotnet user-secrets set "Ebay:Sandbox:ClientSecret" "..."
dotnet user-secrets set "Ebay:Sandbox:RuName" "..."

dotnet user-secrets set "Ebay:Production:ClientId" "..."
dotnet user-secrets set "Ebay:Production:ClientSecret" "..."
dotnet user-secrets set "Ebay:Production:RuName" "..."

dotnet user-secrets set "Legal:CompanyName" "Your Company"
dotnet user-secrets set "Legal:ContactEmail" "privacy@your-domain.com"
dotnet user-secrets set "Legal:WebsiteUrl" "https://your-domain.com"
```

Or use environment variables when preferred:

```bash
export Ebay__Sandbox__ClientId="..."
export Ebay__Sandbox__ClientSecret="..."
export Ebay__Sandbox__RuName="..."
export Ebay__Production__ClientId="..."
export Ebay__Production__ClientSecret="..."
export Ebay__Production__RuName="..."
```

For SQL Server:

```bash
export ConnectionStrings__SqlServer="Server=tcp:...;Database=...;User ID=...;Password=...;Encrypt=True;"
```

If `ConnectionStrings__SqlServer` is not set, the app falls back to local SQLite from [appsettings.json](appsettings.json).

## Local smoke test

Without any eBay secrets configured, the app should still boot and serve its public surfaces:

```bash
cd backend
dotnet run --project EbayStoreManager.Api
```

Then verify:

```bash
curl http://localhost:5141/health
curl http://localhost:5141/ready
curl http://localhost:5141/privacy
curl http://localhost:5141/llms.txt
```

With sandbox or production credentials configured, you can then test the OAuth bootstrap endpoint and full flow.

## Important eBay setup

Your eBay application `RuName` must point to:

```text
https://your-public-api-host/oauth/ebay/callback
```

For production keysets, the marketplace account deletion webhook must also be configured:

```text
https://your-public-api-host/notifications/ebay/marketplace-account-deletion
```

If authorization revocation notifications are enabled for the keyset, configure:

```text
https://your-public-api-host/notifications/ebay/authorization-revocation
```

For production OAuth/privacy configuration, the service can also publicly serve:

```text
https://your-public-api-host/privacy
https://your-public-api-host/privacy-policy
https://your-public-api-host/auth/success
https://your-public-api-host/auth/declined
https://your-public-api-host/llms.txt
```

## Local-token flow

1. CLI starts authorization:

```bash
curl -X POST http://localhost:5141/api/local/ebay/authorize/start \
  -H 'Content-Type: application/json' \
  -d '{
    "environment": "sandbox",
    "callbackUrl": "http://127.0.0.1:8765/callback",
    "marketplaceId": "EBAY_US"
  }'
```

2. Open the returned `authorizeUrl` and finish eBay consent.

3. The backend callback redirects back to the CLI localhost callback with a one-time exchange code.

4. CLI exchanges that code:

```bash
curl -X POST http://localhost:5141/api/local/ebay/authorize/exchange \
  -H 'Content-Type: application/json' \
  -d '{
    "state": "returned-state",
    "code": "one-time-exchange-code"
  }'
```

5. Use that returned session on setup and listing calls:

```bash
curl -X POST http://localhost:5141/api/local/ebay/status \
  -H 'Content-Type: application/json' \
  -d '{
    "session": {
      "environment": "sandbox",
      "marketplaceId": "EBAY_US",
      "accessToken": "..."
    }
  }'
```

## Main endpoints

- `GET /health`
- `GET /ready`
- `GET /llms.txt`
- `GET /privacy`
- `GET /privacy-policy`
- `GET /auth/success`
- `GET /auth/declined`
- `POST /api/local/ebay/authorize/start`
- `POST /api/local/ebay/authorize/exchange`
- `POST /api/local/ebay/refresh`
- `POST /api/local/ebay/status` (compatibility runtime route)
- `POST /api/local/ebay/setup/doctor` (compatibility runtime route)
- `POST /api/local/ebay/setup/policies/sync` (compatibility runtime route)
- `POST /api/local/ebay/setup/location` (compatibility runtime route)
- `POST /api/local/ebay/listings/list` (compatibility runtime route)
- `POST /api/local/ebay/listings/get` (compatibility runtime route)
- `POST /api/local/ebay/listings/create/plan` (compatibility runtime route)
- `POST /api/local/ebay/listings/create/apply` (compatibility runtime route)
- `POST /api/local/ebay/listings/update/plan` (compatibility runtime route)
- `POST /api/local/ebay/listings/update/apply` (compatibility runtime route)
- `POST /api/local/ebay/listings/end/plan` (compatibility runtime route)
- `POST /api/local/ebay/listings/end/apply` (compatibility runtime route)
- `GET /oauth/ebay/callback`
- `GET /notifications/ebay/marketplace-account-deletion`
- `POST /notifications/ebay/marketplace-account-deletion`
- `GET /notifications/ebay/authorization-revocation`
- `POST /notifications/ebay/authorization-revocation`

## Operational hardening

- anonymous OAuth bootstrap endpoints are rate-limited
- expired local auth-state rows are cleaned up automatically in the background
- outbound eBay HTTP calls use bounded retries for 429 and 5xx responses plus transient transport failures
- HTTP request logging is enabled for basic request path, method, status, and duration telemetry
