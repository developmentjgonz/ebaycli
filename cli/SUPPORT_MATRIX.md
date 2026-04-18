# CLI Support Matrix

This file defines the intended operational support level for the public self-managed CLI.

## Auth and Session

| Capability | Status | Notes |
| --- | --- | --- |
| Configure self-managed eBay app credentials | Supported | `ebay config auth` |
| Local OAuth login | Supported | Works with backend relay or manual/direct callback patterns |
| Local session persistence | Supported | Stored in local profile config |
| Access-token refresh | Supported | Automatic before operational commands |
| Local logout | Supported | Clears only the local session |
| Full grant revoke | Partial | CLI provides My eBay revoke guidance; no supported programmatic revoke flow |

## Operational Checks

| Capability | Status | Notes |
| --- | --- | --- |
| Combined operational snapshot | Supported | `ebay status --json` |
| Auth/account status | Supported | `ebay auth status --json` |
| Seller readiness doctor | Supported | `ebay setup doctor --json` |
| Policy default sync | Supported | `ebay setup policies sync` |
| Program opt-in | Supported with eBay constraints | eBay may reject unsupported accounts |
| Merchant location upsert | Supported | `ebay setup location set` |

## Listing Reads

| Capability | Status | Notes |
| --- | --- | --- |
| Active listings list | Supported | Trading-backed for classic listings |
| Sold listings list | Supported | Trading-backed |
| Listing detail (`get`) | Supported | Inventory first, then Trading, then Browse fallback for legacy ids |
| Listing export (`pull`) | Supported | Produces normalized YAML/JSON-friendly spec |

## Listing Writes

| Capability | Status | Notes |
| --- | --- | --- |
| Create plan | Supported | Inventory-based create planning |
| Create apply | Supported with eBay account prerequisites | Requires valid policies/location and category-specific constraints |
| Update plan | Supported | Dispatches Trading vs Inventory by resolved listing type |
| Update apply | Supported | Legacy price/quantity and legacy revise paths are implemented |
| End plan | Supported | Dispatches Trading vs Inventory by resolved listing type |
| End apply | Supported | Legacy end and Inventory withdraw are implemented |

## Known Constraints

- eBay account readiness still controls real create/apply success.
- Some legacy Trading detail calls are unreliable with OAuth. The CLI now uses Browse fallback for legacy listing detail instead of depending solely on Trading `GetItem`.
- The CLI intentionally hides eBay API fragmentation behind a stable command surface, but the internal adapter layer still needs continued testing as more categories and seller configurations are exercised.

## Release Gate

Before treating a branch as release-ready, run:

```bash
cd cli
npm test
npm run build

cd backend
dotnet test EbayStoreManager.sln
```

Recommended live smoke checks on a real profile:

```bash
ebay status --json
ebay listings list --limit 5 --json
ebay listings get <listingId> --json
ebay listings pull <listingId> --out review.yaml --json
ebay listings update <listingId> --file patch.yaml --json
ebay listings end <listingId> --json
```
