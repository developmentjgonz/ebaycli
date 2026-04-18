export function buildCliLlmsText(): string {
  return `# ebaycli

\`ebaycli\` is a self-managed local eBay CLI.

- every user provides their own eBay app credentials
- the CLI exchanges and refreshes user tokens directly with eBay
- the CLI stores the eBay OAuth session locally
- the optional \`.NET\` backend in this repo is a reference implementation for privacy/auth landing pages and other server-side eBay surfaces

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

- \`ebay config auth --client-id ... --client-secret ... --runame ...\`
  - Configure the local CLI profile with the user's own eBay app credentials
- \`ebay auth login --environment production\`
  - Start local eBay OAuth and store the resulting session in the selected CLI profile
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
- update/end dispatch automatically chooses Trading vs Inventory based on the resolved listing type
`;
}
