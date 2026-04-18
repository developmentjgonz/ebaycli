# ebaycli Monorepo

This repository is split into two primary parts:

- [cli](cli): the self-managed npm CLI package
- [backend](backend): the optional ASP.NET reference backend

Public product posture:

- the CLI is the main product
- every user brings their own eBay app credentials
- the backend is optional and exists as a reference implementation for privacy/auth landing pages, optional hosted flows, and eBay-required server-side surfaces

Start here:

- CLI usage and publish details: [cli/README.md](cli/README.md)
- Architecture: [docs/agent-first-architecture.md](docs/agent-first-architecture.md)
- Backend reference setup: [backend/EbayStoreManager.Api/README.md](backend/EbayStoreManager.Api/README.md)
- Backend solution: [backend/EbayStoreManager.sln](backend/EbayStoreManager.sln)
- Testing notes: [TEST_STRATEGY.md](TEST_STRATEGY.md), [TESTING.md](TESTING.md)
