# ebaycli

`ebaycli` is an agent-first local eBay CLI with two auth modes:

- `shared` mode, which uses the hosted backend as a small auth broker for the shared eBay app
- `self-managed` mode, where an advanced user brings their own eBay app credentials

In both modes:

- the local CLI owns the eBay OAuth session for the current machine
- listing and seller workflow logic live in the CLI
- there is no backend user-account or store-owner model in the active product path

## CLI quick start

From [/Users/admin/Projects/ebaycli](/Users/admin/Projects/ebaycli):

```bash
npm install
npm run build

node dist/index.js guide --json
node dist/index.js config auth --mode shared
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

For self-managed mode:

```bash
ebay config auth \
  --mode self-managed \
  --client-id YOUR_CLIENT_ID \
  --client-secret YOUR_CLIENT_SECRET \
  --runame YOUR_RUNAME

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

## Design docs

- [docs/agent-first-architecture.md](docs/agent-first-architecture.md) describes the target architecture this branch is implementing: local listing logic, shared-mode auth broker, and self-managed auth for advanced users.

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
- `/privacy`
- `/privacy-policy`
- `/auth/success`
- `/auth/declined`

## Config

The CLI defaults to the hosted backend URL baked into [constants.ts](/Users/admin/Projects/ebaycli/src/constants.ts), but you can override it:

```bash
node dist/index.js config set --backend-url https://your-backend.example.com
node dist/index.js config status --json
```

Auth mode is configured per local profile:

```bash
node dist/index.js config auth --mode shared

node dist/index.js config auth \
  --mode self-managed \
  --client-id YOUR_CLIENT_ID \
  --client-secret YOUR_CLIENT_SECRET \
  --runame YOUR_RUNAME
```

When you enable self-managed mode and do not pass explicit URLs, the CLI defaults these values from the configured backend URL:

- privacy policy: `/privacy`
- accepted URL: `/auth/success`
- declined URL: `/auth/declined`

The CLI stores its local eBay session in the profile config file under `~/.config/ebaycli/backend-profiles.json` unless `XDG_CONFIG_HOME` is set.

To remove access cleanly:

- `node dist/index.js auth logout` clears only the local session file
- `node dist/index.js auth disconnect` clears the local session and returns the My eBay path needed to revoke the third-party grant fully

## Backend

The backend lives in [/Users/admin/Projects/ebaycli/backend/EbayStoreManager.Api](/Users/admin/Projects/ebaycli/backend/EbayStoreManager.Api). In the target architecture it is primarily:

- the shared-mode auth broker
- the host for public privacy/auth landing pages
- the marketplace account deletion webhook endpoint

Compatibility listing routes still exist on the backend, but the branch direction is to keep listing/setup logic local in the CLI.

For backend setup and endpoints, see [backend/EbayStoreManager.Api/README.md](/Users/admin/Projects/ebaycli/backend/EbayStoreManager.Api/README.md).
