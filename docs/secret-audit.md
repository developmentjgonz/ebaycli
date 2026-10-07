# Secret handling and repository audit

The audit on October 6, 2026 found no likely leaked credentials in the intended repository files, reachable Git history, or built npm package. This is a dated check, not a guarantee about later changes.

## What was checked

- A redacted programmatic scan examined 82 current nonignored files and 303 text objects across 15 reachable Git commits. It checked provider token formats, eBay user tokens, JWTs, private keys, URL credentials, secret assignments, and unusual high entropy literals.
- The actual `ebaycli@0.1.0` npm archive contained 53 files. It included no environment files, saved seller profiles, or private key files.
- [Gitleaks 8.30.1](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1) was downloaded from its official release, verified against its published checksum, and run locally against Git history, an isolated export of the intended files, and the unpacked npm archive. All three scans returned zero findings with the default rules; no baseline or allowlist was added. A fresh scan of 84 intended files after adding the safeguards also passed, and a separate synthetic credential fixture correctly failed the scanner.
- Generic matches were checked without publishing their values. They were placeholders, synthetic test credentials, expiry timestamps, token type labels, assertions, or a known test digest.
- The initial pre-push check covered 85 staged files, including the setup portal, seller restrictions, Grok guide, and public deployment IDs, and all 15 reachable commits. A subsequent check included all 88 staged/current files and 16 reachable commits after the design documentation, reconnect fix, scope cleanup, and lockfile repair. Gitleaks returned zero findings in each scan.

The scan did not read unrelated home credentials, real seller profiles, ignored runtime databases, or deployed Cloudflare secrets. It covered history reachable from local Git refs, not deleted external copies or unreachable Git objects. It did not test whether any credential was active against a provider.

## Continuing protection

The [CI workflow](../.github/workflows/ci.yml) downloads a pinned official Gitleaks binary, checks its SHA-256 checksum, and scans full fetched Git history and current repository files. Findings fail the job. Output is redacted, and inline `gitleaks:allow` comments cannot bypass it. The CLI approach does not require a Gitleaks action license or deployment credentials.

The [ignore rules](../.gitignore) exclude local seller session files, environment files, Wrangler state, databases, npm credentials, and key/certificate files. Sanitized `.env.example`, `.dev.vars.example`, and `.npmrc.example` templates may be committed. The npm package uses an explicit file allowlist in [its package manifest](../cli/package.json).

Ignoring a file does not remove it from existing commits or prove that it is safe. A secret can also be embedded in an ordinary source or documentation file. Keep eBay client secrets and the token encryption key in Cloudflare's secret store; never put seller tokens or agent API keys in source, examples, logs, issues, or agent prompts. Review the package archive before publishing each release.

If a real credential is ever exposed, revoke or rotate it immediately at its provider. Removing the current file alone leaves history and existing copies exposed. Assess affected sessions and logs, then coordinate any necessary history cleanup through the [security reporting process](../SECURITY.md). Do not paste the credential into a report.
