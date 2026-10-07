# Testing

Run all commands below from the repository root unless stated otherwise. The CLI requires a current Node.js 22+ release; Worker development uses the same Node/npm toolchain. Use Node 22.13 or newer for the Worker test suite's built-in SQLite adapter.

## Automated checks

```bash
npm --prefix cli ci
npm --prefix cli test
npm --prefix cli run build
node scripts/check-docs.mjs
npm --prefix backend ci
npm --prefix backend run check
node scripts/check-integration.mjs
```

| Surface | Coverage |
| --- | --- |
| CLI commands | Command registration, relay configuration, bootstrap errors, JSON output, and token redaction |
| Local CLI runtime | Session refresh and persistence, defaults, listing filters, YAML/JSON normalization, local images, and create plans |
| CLI eBay adapter | Trading XML parsing/request shape and Inventory request behavior |
| Reference backend | OAuth start/callback/exchange/refresh, atomic handoffs, encrypted storage, public pages, and notification challenges |
| CLI/relay integration | Two synthetic sellers over HTTP and real loopback, SQL handoff consumption, redaction, refresh, and replay protection |
| Documentation/package | Local documentation links, repository links in package docs, and files included in the npm package |

Tests use mocks, fixtures, in-memory SQLite databases, and temporary configuration directories. They do not authenticate with eBay or alter a seller's account. A passing suite does not establish live eBay compatibility for every account or category.

GitHub Actions runs the CLI on Linux and Windows with Node 22 and 24, plus Worker tests/build and documentation/package checks. Inspect the checked-in [workflow](.github/workflows/ci.yml) for the current matrix.

`node scripts/check-integration.mjs` requires both packages to be built and Node 22.13+. It uses temporary profiles and simulated eBay responses; it never uses a real seller session. Public multi-seller deployment gaps and policy considerations are recorded in [the hosting model](docs/hosting-model.md).

## Package and Worker checks

After building, inspect the CLI package from `cli/`:

```bash
cd cli
npm pack --dry-run
```

It should contain compiled code, the package README, support matrix, license, agent metadata, and examples. Repository-only documents should be linked through GitHub URLs in package documentation.

From the repository root, build the optional Worker without deploying:

```bash
npm --prefix backend run build
```

From `backend/`, apply local D1 migrations and start the development server:

```bash
npm run db:migrate:local
npm run dev
```

See [deployment](docs/deployment.md) for local variables and cloud setup. Static `/health`, `/privacy`, and `/llms.txt` surfaces work without eBay credentials. `/ready` reports configured relay/database readiness; it does not validate live eBay grants or seller readiness.

## Optional live sandbox checks

Use your own seller-ready sandbox account and a relay configured with sandbox credentials. Keep its session in a separate profile:

```bash
node cli/dist/index.js --profile sandbox config set --backend-url https://relay.example.com --json
node cli/dist/index.js --profile sandbox auth login --environment sandbox --json
node cli/dist/index.js --profile sandbox status --json
node cli/dist/index.js --profile sandbox listings list --limit 5 --json
```

Then review a listing draft and plan it:

```bash
node cli/dist/index.js --profile sandbox listings create --file ./draft.yaml --json
```

For a draft explicitly targeting Trading, `--verify` makes a remote eBay validation call without publishing a listing:

```bash
node cli/dist/index.js --profile sandbox listings create --file ./draft.yaml --write-path TRADING --verify --json
```

Only add `--apply` after reviewing the plan and intentionally authorizing the account change. Policy creation, program opt-in, and location setup are also live account changes; they do not use the listing `--apply` gate.

Common sandbox blockers include incomplete seller registration, unavailable Business Policies, missing Inventory locations, and category-specific condition or aspect requirements. Use `setup doctor --json` and the returned eBay errors to identify the next step.

Live browser OAuth completion, Trading mutations, Inventory publishing, and eBay payload changes still need operator verification with suitable accounts.

## Release checklist

1. Run the CLI tests/build and documentation/package checks.
2. Run Worker checks and a local Wrangler smoke test if changing reference infrastructure.
3. Inspect `npm pack --dry-run` from `cli/`.
4. Record any intentional public behavior change in [CHANGELOG.md](CHANGELOG.md).
5. Document live validation performed and remaining account-specific limitations. Never include tokens, credentials, or personal seller details in logs or fixtures.
