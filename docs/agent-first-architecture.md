# Agent-First Architecture

This repository now targets a single public product shape:

- the CLI is the product
- production OAuth uses a backend relay
- each deployment brings its own eBay app credentials in backend configuration
- the CLI stores OAuth session material locally
- listing and seller workflow logic live in the CLI
- the `.NET` backend in this repo is the reference relay implementation

## Why this model

The original direct-only CLI design is not the right production default because eBay OAuth requires a public HTTPS redirect URL. A normal installed CLI cannot reliably provide that URL on `localhost`.

The relay model keeps the CLI usable while preserving a clean product boundary:

- each deployment owns its eBay developer relationship
- backend configuration owns `Client ID`, `Client Secret`, and `RuName`
- the CLI remains agent-first and local
- OAuth callback and token exchange happen on the backend
- the CLI stores the returned seller session locally and performs listing workflows

## Public product boundary

### CLI responsibilities

- store local profile config
- store the eBay OAuth session locally
- call the backend relay to start OAuth
- receive the localhost handoff from the backend relay
- store and refresh the local seller session through the backend relay
- perform listing reads and writes
- normalize Trading and Inventory models behind one CLI surface
- expose agent-facing guide surfaces

### Backend responsibilities

The backend is required for the production OAuth path. It exists as a reference implementation for:

- `/privacy`
- `/auth/success`
- `/auth/declined`
- marketplace account deletion webhook support
- server-side OAuth callback and token exchange
- refresh-token pass-through for the local CLI session

## Auth model

Each profile contains:

```yaml
profile: default
backendBaseUrl: https://your-backend.example.com
ebaySession:
  environment: production
  marketplaceId: EBAY_US
  accessToken: LOCAL_SESSION_ACCESS_TOKEN
  refreshToken: LOCAL_SESSION_REFRESH_TOKEN
```

Notes:

- `backendBaseUrl` is required for the recommended production flow
- eBay app credentials live in backend configuration, not in the normal CLI profile
- `selfManagedApp` remains only as an advanced direct/private testing fallback

## End-to-end auth flow

1. User configures the backend relay URL:

```bash
ebay config set --backend-url https://your-backend.example.com --json
```

2. User starts login:

```bash
ebay auth login --environment production --json
```

3. CLI calls backend `/api/local/ebay/authorize/start`
4. Backend opens eBay consent using backend-configured `Client ID` and `RuName`
4. User signs into eBay and approves access
5. eBay redirects to backend `/oauth/ebay/callback`
6. Backend exchanges the authorization code using backend-configured `Client Secret`
7. Backend redirects to the CLI localhost listener with a one-time exchange code
8. CLI calls backend `/api/local/ebay/authorize/exchange`
9. CLI stores the returned local session
10. CLI refreshes through backend `/api/local/ebay/refresh` as needed

## Backend as relay implementation

The repo includes the ASP.NET backend because production OAuth needs:

- a public HTTPS callback URL
- a privacy policy URL
- auth accepted/declined landing pages
- server-side token exchange and refresh
- marketplace account deletion webhook support

This backend should be described as:

- required for recommended production OAuth
- deployment-owned
- reusable reference infrastructure

It should not be described as a shared public app that lets arbitrary third parties bypass their own deployment relationship.

## Packaging guidance

Preferred repo structure:

- `cli/` or the existing root CLI package
- `backend/` for the ASP.NET reference backend
- shared top-level docs

Preferred public messaging:

- public CLI path: backend-relayed OAuth with local session storage
- backend: reference implementation for deployment-owned relay
- no shared public app mode

## Operational implications

Because the CLI uses a deployment-owned backend relay:

- no eBay app secret is embedded in the npm package
- eBay OAuth has the required public HTTPS callback
- local CLI sessions remain local after handoff
- deployment operators own app credentials, quotas, privacy policy, uptime, and compliance posture

## Summary

The correct public posture for this repo is:

> Ship `ebaycli` as an agent-first local CLI that uses a deployment-owned backend relay for production eBay OAuth, then stores and operates on the seller session locally.
