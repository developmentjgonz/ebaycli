# Code map

The public command surface is in `cli/`; the optional relay is in `backend/`. Tests sit beside each package's source, with separate manifests and lockfiles.

## CLI

```text
index.ts → cli.ts
              ├─ profile-config.ts
              ├─ oauth.ts
              ├─ listing-files.ts
              ├─ runtime.ts → ebay-engine.ts → ebay-api.ts
              └─ output.ts / guide.ts / llms.ts
```

| File | Responsibility |
| --- | --- |
| [index.ts](../cli/src/index.ts) | Executable entrypoint |
| [cli.ts](../cli/src/cli.ts) | Command registration, flags, output selection, and errors |
| [profile-config.ts](../cli/src/profile-config.ts) | Local profile storage and first-run guidance |
| [oauth.ts](../cli/src/oauth.ts) | Relay calls, browser consent, and localhost callback |
| [listing-files.ts](../cli/src/listing-files.ts) | YAML/JSON parsing, draft normalization, and local images |
| [runtime.ts](../cli/src/runtime.ts) | Session refresh, persisted defaults, and workflow orchestration |
| [ebay-engine.ts](../cli/src/ebay-engine.ts) | Readiness, listing resolution, plans, and Trading/Inventory dispatch |
| [ebay-api.ts](../cli/src/ebay-api.ts) | eBay HTTP/XML adapters |
| [types.ts](../cli/src/types.ts) | Profile, session, listing, and response models |
| [output.ts](../cli/src/output.ts) | Human-readable and JSON rendering |
| [guide.ts](../cli/src/guide.ts), [llms.ts](../cli/src/llms.ts) | Runtime discovery |

The listing engine remains a central module because Trading/Inventory dispatch and payload construction share helpers. Use exported operation names to find a path; split it further when a focused feature needs a clearer boundary.

## Worker relay

| File | Responsibility |
| --- | --- |
| [index.ts](../backend/src/index.ts) | HTTP routing, OAuth rate limiting, readiness, and scheduled cleanup |
| [site.ts](../backend/src/site.ts) | Setup portal styles, live checks, command copying, and Grok Bot handoff |
| [config.ts](../backend/src/config.ts) | Public-origin validation and database binding |
| [oauth.ts](../backend/src/oauth.ts) | OAuth state, callback, one-time exchange, and refresh |
| [ebay.ts](../backend/src/ebay.ts) | Environment credentials, scopes, and eBay token/account calls |
| [crypto.ts](../backend/src/crypto.ts) | Random values, hashes, and encrypted token handoffs |
| [notifications.ts](../backend/src/notifications.ts) | eBay challenge response and delivery acknowledgement |
| [pages.ts](../backend/src/pages.ts) | Privacy/auth pages and agent metadata |
| [responses.ts](../backend/src/responses.ts) | JSON responses and problem errors |
| [types.ts](../backend/src/types.ts) | Worker bindings, session contract, and persisted state |
| [0001_auth.sql](../backend/migrations/0001_auth.sql) | Temporary OAuth-state schema |
| [wrangler.jsonc](../backend/wrangler.jsonc) | D1 binding, cron, rate limiter, and deployment variables |

## Where to make common changes

| Change | Touch first | Verify |
| --- | --- | --- |
| New CLI command or flag | `cli/src/cli.ts` | CLI command tests, guide, package README |
| Listing input field | `types.ts`, `listing-files.ts`, engine payload builder | Draft/adapter tests, guide example, YAML examples |
| Trading or Inventory behavior | CLI engine and API adapter | Relevant runtime/API tests |
| Login or refresh | CLI `oauth.ts` and Worker `oauth.ts` | Both packages' OAuth contract tests |
| Local profile behavior | CLI `profile-config.ts` | Temporary-profile tests; preserve stored format |
| Relay route or storage | Worker source and D1 migration | Worker tests and local Wrangler smoke check |
| Documentation or packaging | README/examples/manifests | `node scripts/check-docs.mjs`, package dry run |

Run checks from the correct package; see [CONTRIBUTING.md](../CONTRIBUTING.md) and [TESTING.md](../TESTING.md).
