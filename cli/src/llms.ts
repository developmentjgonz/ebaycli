export function buildCliLlmsText(): string {
  return `# ebaycli

\`ebaycli\` is a backend-relay local eBay CLI.

- production OAuth uses a deployment-owned backend relay because eBay requires a public HTTPS redirect URL
- the backend exchanges and refreshes eBay tokens for the configured deployment
- the CLI stores the eBay OAuth session locally
- the \`.NET\` backend in this repo is the reference relay implementation for privacy/auth landing pages and other server-side eBay surfaces
- direct local eBay app credentials are an advanced fallback, not the recommended production path

## Runtime discovery

Agents using the installed CLI should prefer runtime command discovery over repository inference:

- \`ebay guide --json\`
- \`ebay guide capabilities --json\`
- \`ebay guide workflows --json\`
- \`ebay guide listing-spec --json\`
- \`ebay guide agent-notes --json\`
- \`ebay llms\`

The \`guide\` commands are the most authoritative interface for installed-cli behavior because they are version-matched to the local package.

## Commands

- \`ebay config set --backend-url https://your-backend.example.com --json\`
  - Configure the backend relay URL for eBay OAuth callback and token exchange
- \`ebay auth login --environment production --json\`
  - Start backend-relayed eBay OAuth and store the resulting session in the selected CLI profile
- \`ebay status --json\`
  - Return a combined profile/config/auth/doctor snapshot for agent readiness checks
- \`ebay auth status --json\`
  - Show the connected eBay account
- \`ebay auth disconnect --json\`
  - Clear the local session and return the manual revoke path in My eBay
- \`ebay setup doctor --json\`
  - Show seller readiness, business policy availability, and location readiness
- \`ebay listings list --json\`
  - List active listings
- \`ebay listings list --status SOLD --days 30 --json\`
  - List recently sold listings
- \`ebay listings get <reference> --json\`
  - Fetch normalized listing detail
- \`ebay listings pull <reference> --out <file>\`
  - Export a normalized listing spec
- \`ebay listings create --file <draft.yaml>\`
  - Plan a listing create
- \`ebay listings create --file <draft.yaml> --verify --json\`
  - Validate a Trading/classic create payload without creating the listing
- \`ebay listings update <reference> --file <patch.yaml>\`
  - Plan a listing update
- \`ebay listings end <reference>\`
  - Plan a listing end

## File formats

- Draft listing input: YAML or JSON
- Recommended for humans and agents: YAML
- Command output for automation: JSON via \`--json\`

## Listing model support

- Trading/classic listings for active and sold reads, legacy listing detail, and legacy update/end flows
- Inventory API listings for create flows and Inventory-backed update/end flows
- explicit create routing through \`writePath: INVENTORY|TRADING\` for agent-controlled create intent
- update/end dispatch automatically chooses Trading vs Inventory based on the resolved listing type
`;
}
