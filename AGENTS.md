# AGENTS.md

This is a monorepo with two distinct operating surfaces:

- `/cli`
  - the public self-managed npm CLI
  - TypeScript, Vitest, published package boundary
- `/backend`
  - the optional ASP.NET reference backend
  - .NET solution lives at `/backend/EbayStoreManager.sln`

Agent rules for this repo:

- Treat the CLI as the primary product surface.
- Do not reintroduce shared public auth mode into the CLI.
- Keep the backend framed as optional/reference infrastructure unless explicitly asked otherwise.
- When editing code, preserve the split between `/cli` and `/backend`.
- Run package-specific commands from the correct directory:
  - CLI: `cd /Users/admin/Projects/ebaycli/cli && npm test && npm run build`
  - Backend: `dotnet test /Users/admin/Projects/ebaycli/backend/EbayStoreManager.sln`
- Prefer machine-readable CLI surfaces when reasoning about runtime behavior:
  - `ebay guide --json`
  - `ebay llms`

Documentation entrypoints:

- `/README.md`
- `/docs/agent-first-architecture.md`
- `/cli/README.md`
- `/backend/EbayStoreManager.Api/README.md`
