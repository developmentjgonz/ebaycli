# AGENTS.md

This is a monorepo with two distinct operating surfaces:

- `/cli`
  - the public self-managed npm CLI
  - TypeScript, Vitest, published package boundary
- `/backend`
  - the optional TypeScript reference OAuth relay
  - Cloudflare Worker with D1 auth-state storage

Agent rules for this repo:

- Treat the CLI as the primary product surface.
- Do not reintroduce shared public auth mode into the CLI.
- Keep the backend framed as optional/reference infrastructure unless explicitly asked otherwise.
- When editing code, preserve the split between `/cli` and `/backend`.
- Run package-specific commands from the correct directory:
  - CLI, from the repository root: `npm --prefix cli test && npm --prefix cli run build`
  - Backend, from the repository root: `npm --prefix backend run check`
  - Documentation, from the repository root: `node scripts/check-docs.mjs`
- The Worker implementation is optional; the current CLI uses a deployment-owned relay for OAuth login and refresh. Keep that distinction explicit.
- Preserve existing local profiles and the `backend-profiles.json` storage format.
- Never use a real seller profile or perform live eBay mutations for automated validation.
- Prefer machine-readable CLI surfaces when reasoning about runtime behavior:
  - `ebay guide --json`
  - `ebay llms`

Documentation entrypoints:

- `/README.md`
- `/docs/agent-first-architecture.md`
- `/cli/README.md`
- `/backend/README.md`
- `/CONTRIBUTING.md`
- `/docs/code-map.md`
- `/docs/deployment.md`
