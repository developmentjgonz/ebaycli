# ebaycli

`ebaycli` is a backend-relay local eBay CLI.

- production OAuth uses a deployment-owned backend relay because eBay requires a public HTTPS redirect URL
- the local CLI owns the eBay OAuth session for the current machine
- listing and seller workflow logic live in the CLI
- the `.NET` backend in this repo is the reference relay implementation

## CLI quick start

From `cli/`:

```bash
npm install
npm run build

node dist/index.js guide --json
node dist/index.js config set --backend-url https://your-backend.example.com --json
node dist/index.js auth login --environment sandbox --json
node dist/index.js status --json
node dist/index.js auth status --json
node dist/index.js auth disconnect --json
node dist/index.js setup doctor --json
node dist/index.js listings list --json
```

For a published install:

```bash
npm install -g ebaycli
ebay guide --json
ebay config set --backend-url https://your-backend.example.com --json
ebay auth login --environment production --json
ebay status --json
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

For a single operational snapshot, use:

```bash
node dist/index.js status --json
```

That returns:

- redacted profile configuration
- current auth/session status
- current seller-readiness doctor results

For static runtime metadata, the CLI also exposes:

```bash
node dist/index.js llms
node dist/index.js llms --json
```

The repository also ships a root [llms.txt](../llms.txt) file for monorepo discovery, and this package ships its own [llms.txt](llms.txt) for CLI/package discovery.

## Design docs

- [docs/agent-first-architecture.md](../docs/agent-first-architecture.md) describes the backend-relay production architecture.

## Listing model support

The CLI supports both eBay listing models:

- classic Trading listings for active/sold reads and legacy listing detail
- Inventory API listings for create flows and Inventory-backed listings
- automatic Trading vs Inventory dispatch for update/end based on the resolved listing type

The current support matrix is documented in [SUPPORT_MATRIX.md](SUPPORT_MATRIX.md).

## Public service surfaces

The backend/reference relay exposes:

- `/health`
- `/ready`
- `/llms.txt`
- `/privacy`
- `/privacy-policy`
- `/auth/success`
- `/auth/declined`

## Config

Set the backend relay URL before login:

```bash
node dist/index.js config set --backend-url https://your-backend.example.com --json
node dist/index.js config status --json
```

Advanced direct/private testing can still configure eBay app credentials locally:

```bash
node dist/index.js config auth \
  --client-id YOUR_CLIENT_ID \
  --client-secret YOUR_CLIENT_SECRET \
  --runame YOUR_RUNAME \
  --environment production
```

For production relay mode, eBay app credentials live in backend configuration, not in the npm CLI profile. The backend must expose:

- privacy policy: `/privacy`
- accepted URL: `/auth/success`
- declined URL: `/auth/declined`
- OAuth callback: `/oauth/ebay/callback`

The CLI stores its local eBay session in the profile config file under `~/.config/ebaycli/backend-profiles.json` unless `XDG_CONFIG_HOME` is set.

To remove access cleanly:

- `node dist/index.js auth logout` clears only the local session file
- `node dist/index.js auth disconnect` clears the local session and returns the My eBay path needed to revoke the third-party grant fully

## Backend

The backend lives in [../backend/EbayStoreManager.Api](../backend/EbayStoreManager.Api). In the public architecture it is an optional reference implementation for:

- hosting privacy/auth landing pages
- server-side token exchange/refresh flows
- the marketplace account deletion webhook endpoint

The CLI requires a backend relay for the recommended production path. Advanced users can self-host it or use it as an implementation reference.

For backend setup and endpoints, see [backend/EbayStoreManager.Api/README.md](../backend/EbayStoreManager.Api/README.md).
