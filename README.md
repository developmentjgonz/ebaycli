# ebaycli Monorepo

This repository is split into two primary parts:

- [cli](/Users/admin/Projects/ebaycli/cli): the self-managed npm CLI package
- [backend](/Users/admin/Projects/ebaycli/backend): the optional ASP.NET reference backend

Public product posture:

- the CLI is the main product
- every user brings their own eBay app credentials
- the backend is optional and exists as a reference implementation for privacy/auth landing pages, optional hosted flows, and eBay-required server-side surfaces

Start here:

- CLI usage and publish details: [cli/README.md](/Users/admin/Projects/ebaycli/cli/README.md)
- Architecture: [docs/agent-first-architecture.md](/Users/admin/Projects/ebaycli/docs/agent-first-architecture.md)
- Backend reference setup: [backend/EbayStoreManager.Api/README.md](/Users/admin/Projects/ebaycli/backend/EbayStoreManager.Api/README.md)
- Backend solution: [backend/EbayStoreManager.sln](/Users/admin/Projects/ebaycli/backend/EbayStoreManager.sln)
- Testing notes: [TEST_STRATEGY.md](/Users/admin/Projects/ebaycli/TEST_STRATEGY.md), [TESTING.md](/Users/admin/Projects/ebaycli/TESTING.md)
