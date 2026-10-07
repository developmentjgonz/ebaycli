# Contributing

Start with the [architecture](docs/agent-first-architecture.md) and [code map](docs/code-map.md). The CLI is the primary product; the backend is an optional reference implementation. Keep changes within the appropriate boundary.

## Prerequisites

- Git.
- A current Node.js 22.13+ patch release and npm. CI checks Node 22 and 24.
- The same Node/npm toolchain for the TypeScript Worker backend. Cloudflare credentials are only needed for deployment.

The automated suites need no eBay credentials, hosted relay, or seller account.

## Local setup and checks

Run these commands from the repository root:

```bash
npm --prefix cli ci
npm --prefix cli test
npm --prefix cli run build
node scripts/check-docs.mjs
```

For backend changes:

```bash
npm --prefix backend ci
npm --prefix backend run check
```

CLI watch mode is `npm --prefix cli run test:watch`. To inspect your local build without connecting an account, use `node cli/dist/index.js guide --json`. Detailed coverage and optional live checks are in [TESTING.md](TESTING.md).

## Making a change

1. Open an issue for a substantial feature or architecture change so the intended behavior is clear.
2. Keep the change focused. Match existing formatting; `.editorconfig` defines basic whitespace conventions.
3. Add a regression test for a bug or meaningful behavior change. Use fixtures and temporary config directories, never a real local profile.
4. Update affected command help, runtime guide, package documentation, and examples together.
5. Run checks for the affected package and the documentation check. Explain any checks you could not run.

Preserve JSON output shape, listing plan/`--apply` behavior, existing profile files, and automatic Trading/Inventory dispatch. App secrets belong to the deployment-owned relay. Do not add a shared public auth mode.

Tests must not create, update, or end real eBay listings. Any live smoke test is an explicit operator action against a sandbox account; see [TESTING.md](TESTING.md).

## Pull requests and releases

Describe the concrete problem, resulting behavior, and validation. Link the relevant issue where available. Avoid unrelated dependency churn or formatting changes.

CI runs CLI checks across Linux and Windows, Worker typechecks/tests/build, and repository documentation/package checks. No workflow publishes npm packages or deploys services automatically.

Maintainers prepare releases from `cli/`: update the version and [CHANGELOG.md](CHANGELOG.md), run the release checks in [TESTING.md](TESTING.md), inspect `npm pack --dry-run`, then publish through the normal npm account process. The `prepublishOnly` hook runs the CLI tests and build.

## Community

Be respectful, describe reproducible problems, and keep feedback focused on the work. Use GitHub issues for bugs and feature requests. Report vulnerabilities privately according to [SECURITY.md](SECURITY.md).
