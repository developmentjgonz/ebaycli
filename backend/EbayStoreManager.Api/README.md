# EbayStoreManager.Api

`EbayStoreManager.Api` is the backend that supports the local-token CLI model:

- the backend owns the shared eBay app credentials
- the CLI starts eBay OAuth with a localhost callback
- the backend exchanges the auth code and refreshes tokens
- the CLI stores the returned eBay session locally
- listing and setup calls post that local session context back to the backend for execution

## Local run

From [/Users/admin/Projects/ebaycli](/Users/admin/Projects/ebaycli):

```bash
dotnet build EbayStoreManager.sln
dotnet test EbayStoreManager.sln
dotnet run --project backend/EbayStoreManager.Api
```

Default local URLs come from [launchSettings.json](/Users/admin/Projects/ebaycli/backend/EbayStoreManager.Api/Properties/launchSettings.json):

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

## Required configuration

Set eBay credentials before using OAuth:

```bash
export Ebay__Sandbox__ClientId="..."
export Ebay__Sandbox__ClientSecret="..."
export Ebay__Sandbox__RuName="..."
export Ebay__Production__ClientId="..."
export Ebay__Production__ClientSecret="..."
export Ebay__Production__RuName="..."
```

For Azure SQL:

```bash
export ConnectionStrings__SqlServer="Server=tcp:...;Database=...;User ID=...;Password=...;Encrypt=True;"
```

If `ConnectionStrings__SqlServer` is not set, the app falls back to local SQLite from [appsettings.json](/Users/admin/Projects/ebaycli/backend/EbayStoreManager.Api/appsettings.json).

## Important eBay setup

Your eBay application `RuName` must point to:

```text
https://your-public-api-host/oauth/ebay/callback
```

For production keysets, the marketplace account deletion webhook must also be configured:

```text
https://your-public-api-host/notifications/ebay/marketplace-account-deletion
```

For production OAuth/privacy configuration, the service can also publicly serve:

```text
https://your-public-api-host/privacy-policy
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
- `GET /privacy-policy`
- `POST /api/local/ebay/authorize/start`
- `POST /api/local/ebay/authorize/exchange`
- `POST /api/local/ebay/refresh`
- `POST /api/local/ebay/status`
- `POST /api/local/ebay/setup/doctor`
- `POST /api/local/ebay/setup/policies/sync`
- `POST /api/local/ebay/setup/location`
- `POST /api/local/ebay/listings/list`
- `POST /api/local/ebay/listings/get`
- `POST /api/local/ebay/listings/create/plan`
- `POST /api/local/ebay/listings/create/apply`
- `POST /api/local/ebay/listings/update/plan`
- `POST /api/local/ebay/listings/update/apply`
- `POST /api/local/ebay/listings/end/plan`
- `POST /api/local/ebay/listings/end/apply`
- `GET /oauth/ebay/callback`
- `GET /notifications/ebay/marketplace-account-deletion`
- `POST /notifications/ebay/marketplace-account-deletion`

## Operational hardening

- anonymous OAuth bootstrap endpoints are rate-limited
- expired local auth-state rows are cleaned up automatically in the background
- outbound eBay HTTP calls use bounded retries for 429 and 5xx responses plus transient transport failures
- HTTP request logging is enabled for basic request path, method, status, and duration telemetry
