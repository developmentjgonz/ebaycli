# CLI Support Matrix

This matrix describes the implemented public CLI surface. Runtime commands and `ebay guide --json` are version-matched to your installed package. See the [package README](README.md) for setup and workflows.

## Authentication and profiles

| Capability | Support | Notes |
| --- | --- | --- |
| Configure relay URL | Supported | `ebay config set --backend-url URL`; selected with `--profile NAME` |
| Login through deployment-owned relay | Supported | Sandbox and production; relay owns app credentials and the public HTTPS callback |
| Configure eBay app credentials in CLI | Unsupported | Configure credentials in your relay deployment |
| Manual consent URL opening | Supported | `auth login --no-open` prints the URL to stderr and waits for the localhost callback on the same machine |
| Direct OAuth or pasted callback codes | Unsupported | Login receives the validated local callback from the relay |
| Local session persistence | Supported | Saved in the selected local profile |
| Access-token refresh | Supported | Operational commands refresh expiring tokens through the relay |
| Local logout | Supported | Clears only the local session |
| Full grant revocation | Manual | `auth disconnect` supplies My eBay guidance; no programmatic revoke flow |

The relay capability is required for current login and refresh. The repository's TypeScript Cloudflare Worker is an optional reference implementation; another compatible deployment-owned relay can provide the same endpoints. See the [backend README](https://github.com/developmentjgonz/ebaycli/blob/main/backend/README.md) and [deployment.md](https://github.com/developmentjgonz/ebaycli/blob/main/docs/deployment.md).

## Seller setup and checks

| Capability | Support | Notes |
| --- | --- | --- |
| Combined operational snapshot | Supported | `ebay status --json` |
| Auth/account status | Supported | `ebay auth status --json` |
| Seller readiness doctor | Supported | `ebay setup doctor --json` |
| Policy creation/default sync | Supported with account constraints | `ebay setup policies sync`; [policy payload](examples/policies.yaml) |
| Program opt-in | Supported with account constraints | eBay may reject unsupported accounts |
| Merchant location creation/update/default | Supported | `ebay setup location set`; [location payload](examples/location.yaml) |

Setup writes act immediately and do not have `--apply` or plan modes.

## Listing reads and writes

| Capability | Support | Notes |
| --- | --- | --- |
| Active listings | Supported | Trading-backed for classic listings |
| Sold listings | Supported | Trading-backed; configurable lookback |
| Detail and export | Supported | Normalized data; Inventory, Trading, and legacy Browse fallback |
| Create plan | Supported | Defaults to Inventory; explicit `writePath` or `--write-path` selects Trading |
| Create verification | Trading only | `--verify` validates remotely without creating a listing; can upload local images |
| Create apply | Supported with account/category constraints | Inventory and Trading fixed-price paths implemented |
| Update plan/apply | Supported | Resolved listing model selects Trading or Inventory |
| End plan/apply | Supported | Trading end or Inventory withdrawal |

Create, update, and end print a plan unless `--apply` is supplied. Inventory `--verify` returns `verified: false` and a plan; it is not a remote verification success. eBay can still reject an apply after a successful plan or verification.

## Constraints

- Seller registration and category/account requirements control real publication success.
- Inventory publishing requires policy IDs and a merchant location, supplied in the draft or saved as profile defaults.
- Review condition, descriptors, category, and location when recreating a listing across Trading and Inventory models.
- Legacy Trading detail can use Browse fallback; exported specs still need review before reuse.
- Live API and account-specific behavior need verification beyond fixture-based automated tests.

## Validation and release checks

From the repository root, run each package in its own directory:

```bash
cd cli
npm ci
npm run check
cd ..
cd backend
npm ci
npm run check
cd ..
node scripts/check-docs.mjs
```

Use a current Node.js 22 or newer release for development; the backend test suite requires Node 22.13 or newer. Backend hosting uses Cloudflare Workers and D1. For CLI package contents, run `npm pack --dry-run` from `cli/`. See [CONTRIBUTING.md](https://github.com/developmentjgonz/ebaycli/blob/main/CONTRIBUTING.md) and [TESTING.md](https://github.com/developmentjgonz/ebaycli/blob/main/TESTING.md) for validation details.

Read-only and planning smoke checks for an already connected profile:

```bash
ebay status --json
ebay listings list --limit 5 --json
ebay listings get listing:YOUR_LISTING_ID --json
ebay listings pull listing:YOUR_LISTING_ID --out review.yaml --json
ebay listings create --file draft.yaml --json
ebay listings update listing:YOUR_LISTING_ID --file patch.yaml --json
ebay listings end listing:YOUR_LISTING_ID --json
```

For a reviewed Trading draft, also run `ebay listings create --file draft.yaml --verify --json`. Live apply checks should use a seller-ready sandbox profile or an explicitly selected listing. A connected sandbox account alone does not demonstrate seller readiness.
