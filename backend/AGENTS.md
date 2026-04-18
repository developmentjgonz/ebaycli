# AGENTS.md

This directory contains the optional ASP.NET reference backend for `ebaycli`.

Intent:

- host privacy/auth landing pages
- show one reference implementation of server-side eBay-required surfaces
- remain optional for the public self-managed CLI path

Editing rules:

- Keep backend configuration honest: only expose settings actually used by runtime code.
- Do not drift back toward a required shared public broker architecture unless explicitly requested.
- Production secrets must stay out of checked-in config.
- Prefer generic legal/appsettings defaults in source; real deployments override them with environment variables, App Service settings, or user-secrets.

Validation:

```bash
dotnet test /Users/admin/Projects/ebaycli/backend/EbayStoreManager.sln
```

Key files:

- `/Users/admin/Projects/ebaycli/backend/EbayStoreManager.Api/Program.cs`
- `/Users/admin/Projects/ebaycli/backend/EbayStoreManager.Api/appsettings.json`
- `/Users/admin/Projects/ebaycli/backend/EbayStoreManager.Api/Configuration`
- `/Users/admin/Projects/ebaycli/backend/EbayStoreManager.Api/Services`
