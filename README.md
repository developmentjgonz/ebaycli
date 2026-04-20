# ebaycli Monorepo

This repository is split into two primary parts:

- [cli](cli): the npm CLI package
- [backend](backend): the ASP.NET reference backend relay

Public product posture:

- the CLI is the main product
- production OAuth uses a deployment-owned backend relay because eBay requires a public HTTPS redirect URL
- eBay app credentials live in backend configuration, not in the npm package
- the backend exists as a reference implementation for privacy/auth landing pages, hosted OAuth relay, and eBay-required server-side surfaces

Start here:

- CLI usage and publish details: [cli/README.md](cli/README.md)
- Architecture: [docs/agent-first-architecture.md](docs/agent-first-architecture.md)
- Backend reference setup: [backend/EbayStoreManager.Api/README.md](backend/EbayStoreManager.Api/README.md)
- Backend solution: [backend/EbayStoreManager.sln](backend/EbayStoreManager.sln)
- Testing notes: [TEST_STRATEGY.md](TEST_STRATEGY.md), [TESTING.md](TESTING.md)
