# ebaycli

[![Checks](https://github.com/developmentjgonz/ebaycli/actions/workflows/ci.yml/badge.svg)](https://github.com/developmentjgonz/ebaycli/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A local eBay seller CLI for people and agents. Read listings, export editable drafts, and review a plan before creating, updating, or ending a listing.

- **Discoverable:** command help, `ebay guide --json`, and `ebay llms` explain workflows and inputs.
- **Reviewable:** listing writes produce a plan by default; `--apply` executes the change.
- **Local:** seller sessions, profiles, and listing workflows stay on your machine.
- **Deployment-owned auth:** your relay owns the eBay app credentials and handles OAuth login and refresh.
- **Two listing models:** Trading/classic and Inventory listings share one command surface.

This is an early release. Supported flows are described in the [support matrix](cli/SUPPORT_MATRIX.md); live results depend on eBay account readiness, category requirements, and API permissions. This project is independent of eBay and is not endorsed by eBay.

## Try it from source

Prerequisite: Node.js 22 or newer, using a current patch release. The package has not yet been published to npm.

```bash
git clone https://github.com/developmentjgonz/ebaycli.git
cd ebaycli
npm --prefix cli ci
npm --prefix cli run build
node cli/dist/index.js --help
node cli/dist/index.js guide --json
```

Discovery works without eBay credentials. To connect a seller account, first configure a deployment-owned relay:

```bash
node cli/dist/index.js config set --backend-url https://relay.example.com --json
node cli/dist/index.js auth login --environment sandbox --json
node cli/dist/index.js status --json
node cli/dist/index.js listings list --limit 5 --json
```

Use a seller-ready sandbox account while learning the workflow. [CLI usage](cli/README.md) covers installation, profiles, examples, and listing plans. [Relay deployment](docs/deployment.md) covers the public HTTPS service used for login.

## Find your way around

| I want to… | Start here |
| --- | --- |
| Use the CLI | [CLI README](cli/README.md) |
| Draft a listing or update | [Examples](cli/examples/README.md) |
| Check supported operations | [Support matrix](cli/SUPPORT_MATRIX.md) |
| Understand OAuth and product boundaries | [Architecture](docs/agent-first-architecture.md) |
| Understand local profiles | [Profiles](docs/profiles.md) |
| Understand multiple sellers and agent hosting | [Hosting model and public-service gaps](docs/hosting-model.md) |
| Connect your own store to Grok Bot | [Grok Bot setup](docs/grok-bot.md) |
| Host the reference relay, including with Cloudflare | [Deployment guide](docs/deployment.md) |
| Run the optional TypeScript relay locally | [Backend README](backend/README.md) |
| Find the code for a feature | [Code map](docs/code-map.md) |
| Contribute and run checks | [Contributing](CONTRIBUTING.md), [Testing](TESTING.md) |
| Report a security issue | [Security policy](SECURITY.md) |

## Repository boundaries

```text
cli/       Public npm package: commands, local profiles, eBay workflows, tests
backend/   Optional TypeScript Cloudflare Worker relay, D1 migrations, tests
docs/      Architecture, profiles, source map, and hosting guidance
scripts/   Dependency-free repository checks
.github/   CI, dependency updates, and contribution templates
```

The CLI is the product. The TypeScript backend deploys directly to Cloudflare Workers, with D1 storing temporary OAuth handoff state. It is an optional implementation of the relay interface; the current CLI uses that interface for OAuth login and refresh. There is no shared public app mode, and the npm package contains no eBay app secret.

Contributions are welcome through [issues](https://github.com/developmentjgonz/ebaycli/issues) and pull requests. See [CONTRIBUTING.md](CONTRIBUTING.md) before making changes. Licensed under [MIT](LICENSE).
