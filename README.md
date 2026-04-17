# ebaycli

`ebaycli` is now a single-model product:

- the local CLI owns the eBay OAuth session for the current machine
- the backend keeps the shared eBay app secret server-side
- the backend exchanges and refreshes tokens, then executes listing operations with the token the CLI presents

There is no backend user account flow and no backend store-owner model in the shipped CLI path anymore.

## CLI quick start

From [/Users/admin/Projects/ebaycli](/Users/admin/Projects/ebaycli):

```bash
npm install
npm run build

node dist/index.js guide --json
node dist/index.js auth login --environment sandbox
node dist/index.js auth status --json
node dist/index.js auth disconnect --json
node dist/index.js setup doctor --json
node dist/index.js listings list --json
```

For a published install:

```bash
npm install -g ebaycli
ebay guide --json
ebay auth login --environment production
```

Once connected, the normal workflow is:

```bash
node dist/index.js listings get sku:YOURSKU --json
node dist/index.js listings pull sku:YOURSKU --out ./listing.yaml
node dist/index.js listings create --file ./listing.yaml
node dist/index.js listings create --file ./listing.yaml --apply
node dist/index.js listings update sku:YOURSKU --file ./patch.yaml
node dist/index.js listings end sku:YOURSKU
```

## Agent-facing guide surface

The CLI now exposes a self-describing guide surface so agents can inspect workflows and input formats without reading the repository:

```bash
node dist/index.js guide --json
node dist/index.js guide capabilities --json
node dist/index.js guide workflows --json
node dist/index.js guide listing-spec --json
node dist/index.js guide agent-notes --json
```

Use that output before generating listing drafts or choosing write operations.

The repository also ships a root `llms.txt` file for LLM/tooling discovery.

## Listing model support

The backend supports both eBay listing models:

- classic Trading listings for active/sold reads and legacy listing detail
- Inventory API listings for create flows and Inventory-backed listings
- automatic Trading vs Inventory dispatch for update/end based on the resolved listing type

## Public service surfaces

The deployed backend now exposes:

- `/health`
- `/ready`
- `/llms.txt`
- `/privacy-policy`

## Config

The CLI defaults to the hosted backend URL baked into [constants.ts](/Users/admin/Projects/ebaycli/src/constants.ts), but you can override it:

```bash
node dist/index.js config set --backend-url https://your-backend.example.com
node dist/index.js config status --json
```

The CLI stores its local eBay session in the profile config file under `~/.config/ebaycli/backend-profiles.json` unless `XDG_CONFIG_HOME` is set.

To remove access cleanly:

- `node dist/index.js auth logout` clears only the local session file
- `node dist/index.js auth disconnect` clears the local session and returns the My eBay path needed to revoke the third-party grant fully

## Backend

The backend lives in [/Users/admin/Projects/ebaycli/backend/EbayStoreManager.Api](/Users/admin/Projects/ebaycli/backend/EbayStoreManager.Api) and exposes the local-token eBay routes plus the marketplace account deletion webhook.

For backend setup and endpoints, see [backend/EbayStoreManager.Api/README.md](/Users/admin/Projects/ebaycli/backend/EbayStoreManager.Api/README.md).
