export function buildCliLlmsText(): string {
  return `# ebaycli

\`ebaycli\` is a backend-relay local eBay CLI.

- sandbox and production OAuth use a deployment-owned backend relay with a public HTTPS callback
- the backend exchanges and refreshes eBay tokens for the configured deployment
- the CLI stores the eBay OAuth session locally
- the TypeScript Cloudflare Worker in this repo is an optional reference implementation of the required login/refresh relay capability
- direct local eBay app credentials and shared public app authentication are not supported by the CLI

## Runtime discovery

Agents using the installed CLI should prefer runtime command discovery over repository inference:

- \`ebay guide --json\`
- \`ebay guide capabilities --json\`
- \`ebay guide workflows --json\`
- \`ebay guide listing-spec --json\`
- \`ebay guide agent-notes --json\`
- \`ebay llms\`

The \`guide\` commands are the most authoritative interface for installed-cli behavior because they are version-matched to the local package.

## Profiles and browser consent

Connection examples below use the default production profile. Add the same \`--profile NAME\` to every connection, setup, and listing command when selecting a different profile. Keep sandbox and production in separate profiles; sandbox login uses \`--environment sandbox\` and a relay configured for sandbox.

Complete consent in a browser on the machine running the CLI so its redirect reaches the localhost listener. \`ebay auth login --no-open\` prints the consent URL to stderr before waiting; JSON results remain on stdout. Pasting callback codes and remote/headless handoff are not established workflows.

Profiles select sessions and defaults; they are not security boundaries. Concurrent agents should use separate \`XDG_CONFIG_HOME\` directories or serialize operations that save profiles. The profile file has no cross-process write lock.

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
- \`ebay setup policies sync --json\`
  - Read business policies and select local defaults; \`--create-from <file>\` creates policies on eBay immediately
- \`ebay setup policies opt-in --json\`
  - Attempt seller program opt-in immediately
- \`ebay setup location set --file <location.yaml> --json\`
  - Create/update a merchant location immediately; \`--key <key>\` without a file selects an existing location as the local default
- \`ebay listings list --json\`
  - List active listings
- \`ebay listings list --status SOLD --days 30 --json\`
  - List recently sold listings
- \`ebay listings get <reference> --json\`
  - Fetch normalized listing detail
- \`ebay listings pull <reference> --out <file> --json\`
  - Export a normalized listing spec
- \`ebay listings create --file <draft.yaml> --json\`
  - Plan a listing create
- \`ebay listings create --file <draft.yaml> --write-path TRADING --verify --json\`
  - Validate a Trading/classic create payload without creating the listing; local images may be uploaded
- \`ebay listings update <reference> --file <patch.yaml> --json\`
  - Plan a listing update
- \`ebay listings end <reference> --json\`
  - Plan a listing end

## File formats

- Draft listing input: YAML or JSON
- Recommended for humans and agents: YAML
- Command output for automation: JSON via \`--json\`
- Relative image paths resolve from the draft or patch file's directory

## Listing model support

- Trading/classic listings for active and sold reads, classic listing detail, fixed-price create, and classic update/end flows
- Inventory API listings for create flows and Inventory-backed update/end flows
- explicit create routing through \`writePath: INVENTORY|TRADING\` for agent-controlled create intent
- update/end dispatch automatically chooses Trading vs Inventory based on the resolved listing type
- create defaults to Inventory unless \`writePath: TRADING\` or \`--write-path TRADING\` selects Trading

## Account changes

- Listing create/update/end commands print plans unless \`--apply\` executes the reviewed change.
- Inventory remote verification is not implemented: Inventory \`--verify\` returns \`verified: false\` with a plan, not validation success.
- Do not combine \`--verify\` with \`--apply\`. A plan or successful Trading verification does not guarantee eBay accepts publication.
- Setup policy creation, program opt-in, and location creation/update act immediately; setup commands have no plan or \`--apply\` mode.
- Apply only seller-authorized changes. OAuth grants API access; it does not review a draft or approve each later mutation.
- \`auth logout\` clears the local session; \`auth disconnect\` also supplies manual My eBay grant-revocation guidance.
`;
}
