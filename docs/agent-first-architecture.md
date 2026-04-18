# Agent-First Architecture

This repository now targets a single public product shape:

- the CLI is the product
- the CLI is self-managed
- every user brings their own eBay app credentials
- the CLI stores OAuth session material locally
- listing and seller workflow logic live in the CLI
- the `.NET` backend in this repo is an optional reference implementation

## Why this model

The original shared-app design was technically workable, but it created an avoidable policy risk for a public, scriptable CLI. A shared seller CLI can look like third parties are getting programmatic control over eBay through one application's credentials.

The self-managed model removes that ambiguity:

- each user owns their own eBay developer relationship
- each user owns their own `Client ID`, `Client Secret`, and `RuName`
- the CLI remains agent-first and local
- the repo can still include a backend example for teams that want hosted pages or server-side token handling

## Public product boundary

### CLI responsibilities

- store local profile config
- store the eBay OAuth session locally
- build the consent URL
- exchange and refresh tokens directly with eBay
- perform listing reads and writes
- normalize Trading and Inventory models behind one CLI surface
- expose agent-facing guide surfaces

### Optional backend responsibilities

The backend is not required for the default CLI path. It exists as a reference implementation for:

- `/privacy`
- `/auth/success`
- `/auth/declined`
- marketplace account deletion webhook support
- optional server-side OAuth callback or token services for private deployments

## Auth model

Each profile contains:

```yaml
profile: default
backendBaseUrl: https://your-optional-backend.example.com
selfManagedApp:
  environment: production
  clientId: YOUR_CLIENT_ID
  clientSecret: YOUR_CLIENT_SECRET
  runame: YOUR_RUNAME
  privacyPolicyUrl: https://your-site.example.com/privacy
  acceptedUrl: https://your-site.example.com/auth/success
  declinedUrl: https://your-site.example.com/auth/declined
```

Notes:

- `backendBaseUrl` is optional for the public CLI flow
- if the optional URLs are not supplied, the CLI derives them from `backendBaseUrl`
- if no companion site exists, the user should pass explicit public URLs

## End-to-end auth flow

1. User configures their eBay app credentials:

```bash
ebay config auth \
  --client-id YOUR_CLIENT_ID \
  --client-secret YOUR_CLIENT_SECRET \
  --runame YOUR_RUNAME \
  --environment production
```

2. User starts login:

```bash
ebay auth login --environment production
```

3. CLI opens the eBay consent page using the user's own `Client ID` and `RuName`
4. User signs into eBay and approves access
5. eBay redirects to the configured accepted URL
6. CLI receives the code via localhost callback or manual paste flow
7. CLI exchanges the code directly with eBay
8. CLI stores the local session
9. CLI refreshes the session directly with eBay as needed

## Backend as reference implementation

The repo still includes the ASP.NET backend because it is useful for:

- users who want a ready-made privacy page and auth landing pages
- private deployments that prefer server-side token exchange
- teams that want a starting point for operational hosting on Azure
- demonstrating the eBay-required server-side surfaces in a concrete implementation

This backend should be described as:

- optional
- self-hosted or private
- reference/example infrastructure

It should not be described as the default public dependency for the CLI.

## Packaging guidance

Preferred repo structure:

- `cli/` or the existing root CLI package
- `backend/` for the ASP.NET reference backend
- shared top-level docs

Preferred public messaging:

- public CLI path: self-managed only
- backend: optional reference implementation
- no shared public app mode

## Operational implications

Because the CLI is self-managed:

- no shared public app secret is required
- no shared public auth broker is required
- no shared app-level quota is imposed by your hosted service
- support burden is clearer because each user owns their own eBay app configuration

## Summary

The correct public posture for this repo is:

> Ship `ebaycli` as a self-managed, agent-first local CLI. Include the `.NET` backend as an optional reference implementation for eBay-required server-side surfaces and private/self-hosted deployments.
