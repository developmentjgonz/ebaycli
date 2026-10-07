# CLI contributor instructions

This directory is the publishable npm package for `ebaycli` and the primary product surface.

- Keep public commands stable and machine-readable. Prefer `--json` for read and plan flows.
- Preserve listing plan versus `--apply` semantics, and Trading versus Inventory dispatch.
- The CLI stores seller sessions locally. OAuth login and refresh use a deployment-owned relay; app credentials stay on that relay.
- The Cloudflare Worker is one optional implementation of the relay contract. Do not introduce shared public auth or direct app-secret configuration in the CLI.
- Preserve the existing `backend-profiles.json` filename and profile field format. Do not migrate or clear user profiles silently.
- Keep `guide --json`, `llms`, the package README, support matrix, and examples aligned with commands.
- Test with temporary config directories and mocked eBay responses. Do not touch real seller profiles.

From this directory:

```bash
npm ci
npm test
npm run build
```

Code entrypoints: `src/cli.ts`, `src/runtime.ts`, `src/oauth.ts`, `src/profile-config.ts`, `src/listing-files.ts`, `src/ebay-engine.ts`, and `src/ebay-api.ts`. See [the code map](../docs/code-map.md) and [contribution guide](../CONTRIBUTING.md).
