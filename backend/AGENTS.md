# AGENTS.md

This directory contains the optional TypeScript reference OAuth relay for Cloudflare Workers. It uses D1 through the `AUTH_DB` binding.

Product boundary:

- The CLI is the primary product and performs listing/seller workflows directly against eBay.
- The relay provides public OAuth callback, token exchange/refresh, legal/auth pages, and eBay notification endpoints.
- The reference Worker implementation is optional; the current CLI still requires a compatible deployment-owned relay for login and refresh.
- Do not add shared public auth mode, backend user accounts, or duplicate listing/setup routes.

Editing rules:

- Preserve `/api/local/ebay/authorize/start`, `/api/local/ebay/authorize/exchange`, `/api/local/ebay/refresh`, and the session contract consumed by the CLI.
- Keep eBay credentials and `TOKEN_ENCRYPTION_KEY` in Worker secrets. Never check tokens, real credentials, or `.dev.vars` into source.
- Validate callback destinations and keep OAuth state and handoff codes expiring and one-time-use.
- Preserve encrypted temporary handoff storage and atomic D1 exchange consumption.
- Keep runtime code compatible with Workers Web APIs; Node.js is development tooling, not the deployed server runtime.
- Use versioned D1 migrations in `migrations/`; preserve existing deployments when extending the schema.
- Only expose configuration that runtime uses. Legal defaults must remain generic.
- Keep public errors and logs free of credentials, OAuth codes, and seller tokens.
- Document local checks separately from live eBay OAuth and Cloudflare deployment verification.

Validation from `backend/`:

```bash
npm ci
npm run check
```

For local D1 and Worker smoke checks, follow [README.md](README.md). Production configuration and publishing steps are in [../docs/deployment.md](../docs/deployment.md).
