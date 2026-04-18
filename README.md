# ebaycli

`ebaycli` is a self-managed local eBay CLI.

- every user configures their own eBay app credentials locally
- the local CLI owns the eBay OAuth session for the current machine
- listing and seller workflow logic live in the CLI
- the `.NET` backend in this repo is an optional reference implementation, not the default product dependency

## CLI quick start

From [/Users/admin/Projects/ebaycli](/Users/admin/Projects/ebaycli):

```bash
npm install
npm run build

node dist/index.js guide --json
node dist/index.js config auth \
  --client-id YOUR_CLIENT_ID \
  --client-secret YOUR_CLIENT_SECRET \
  --runame YOUR_RUNAME
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
ebay config auth \
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

- [docs/agent-first-architecture.md](docs/agent-first-architecture.md) describes the self-managed public architecture and the role of the optional reference backend.

## Listing model support

The CLI supports both eBay listing models:

- classic Trading listings for active/sold reads and legacy listing detail
- Inventory API listings for create flows and Inventory-backed listings
- automatic Trading vs Inventory dispatch for update/end based on the resolved listing type

## Public service surfaces

The optional backend/reference implementation exposes:

- `/health`
- `/ready`
- `/llms.txt`
- `/privacy`
- `/privacy-policy`
- `/auth/success`
- `/auth/declined`

## Config

If you want to use the optional companion backend/site for privacy and auth landing pages, set it explicitly:

```bash
node dist/index.js config set --backend-url https://your-backend.example.com
node dist/index.js config status --json
```

eBay app credentials are configured per local profile:

```bash
node dist/index.js config auth \
  --client-id YOUR_CLIENT_ID \
  --client-secret YOUR_CLIENT_SECRET \
  --runame YOUR_RUNAME \
  --environment production
```

When you do not pass explicit URLs and you have configured an optional backend/site URL, the CLI derives these values from it:

- privacy policy: `/privacy`
- accepted URL: `/auth/success`
- declined URL: `/auth/declined`

The CLI stores its local eBay session in the profile config file under `~/.config/ebaycli/backend-profiles.json` unless `XDG_CONFIG_HOME` is set.

To remove access cleanly:

- `node dist/index.js auth logout` clears only the local session file
- `node dist/index.js auth disconnect` clears the local session and returns the My eBay path needed to revoke the third-party grant fully

## Backend

The backend lives in [/Users/admin/Projects/ebaycli/backend/EbayStoreManager.Api](/Users/admin/Projects/ebaycli/backend/EbayStoreManager.Api). In the public architecture it is an optional reference implementation for:

- hosting privacy/auth landing pages
- optional server-side token exchange/refresh flows
- the marketplace account deletion webhook endpoint

The CLI does not require this backend for the default self-managed path. Advanced users can self-host it or use it as an implementation reference.

For backend setup and endpoints, see [backend/EbayStoreManager.Api/README.md](/Users/admin/Projects/ebaycli/backend/EbayStoreManager.Api/README.md).
