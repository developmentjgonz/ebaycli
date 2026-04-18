# Sandbox Testing Notes

## Current Sandbox User

- Sandbox username: `TESTUSER_cli01`
- eBay username returned by OAuth/session status: `testuser_cli01`
- Purpose: local CLI sandbox validation for auth, doctor, listing reads, and create-flow dry runs

## What Works With This User

- `auth login --environment sandbox`
- `auth status --json`
- `setup doctor --json`
- `listings list --json`
- `listings create --json` dry-run planning

## Current Known Limitations On This User

- Seller registration is not complete
- eBay Business Policies are not available for this account
- Inventory location readiness is not complete
- Real `listings create --apply` is blocked until the sandbox seller account has valid policy IDs and a usable location

## Commands We Used

```bash
npm run build

node cli/dist/index.js --profile sandbox auth login --environment sandbox
node cli/dist/index.js --profile sandbox auth status --json
node cli/dist/index.js --profile sandbox setup doctor --json
node cli/dist/index.js --profile sandbox listings list --json
node cli/dist/index.js --profile sandbox listings create --file /tmp/ebay-listing-XXXXXX.json --json
node cli/dist/index.js --profile sandbox listings create --file /tmp/ebay-listing-XXXXXX.json --apply --json
```

## Recommended Next Step

- Create or configure a seller-ready sandbox user with valid Business Policies and an inventory location, then reconnect with:

```bash
node cli/dist/index.js --profile sandbox auth login --environment sandbox
```
