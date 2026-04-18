# AGENTS.md

This directory is the publishable npm package for `ebaycli`.

Intent:

- self-managed local eBay CLI
- user-owned eBay app credentials
- local OAuth session storage
- agent-friendly runtime discovery

Editing rules:

- Keep commands stable and machine-readable.
- Prefer `--json` support for read/plan flows.
- Preserve dry-run versus `--apply` semantics.
- Do not assume the optional backend is present for normal CLI use.
- Keep `guide --json` and `llms` aligned with actual runtime behavior.

Validation:

```bash
cd /Users/admin/Projects/ebaycli/cli
npm test
npm run build
```

Key files:

- `/Users/admin/Projects/ebaycli/cli/src/cli.ts`
- `/Users/admin/Projects/ebaycli/cli/src/guide.ts`
- `/Users/admin/Projects/ebaycli/cli/src/llms.ts`
- `/Users/admin/Projects/ebaycli/cli/src/backend-domain.ts`
- `/Users/admin/Projects/ebaycli/cli/tests`
