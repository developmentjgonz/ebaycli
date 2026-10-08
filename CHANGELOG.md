# Changelog

User-visible changes are recorded here. Package versions are defined in `cli/package.json`.

## Unreleased

- Align authentication documentation with the deployment-owned relay interface.
- Add contributor, profile, code-map, testing, and Cloudflare hosting guidance.
- Include reusable examples and repository links in the npm package.
- Separate CLI profile, OAuth, draft-file, and operational runtime modules while retaining existing profile storage.
- Redact seller tokens from configuration and login output.
- Restrict local profile permissions on POSIX and parse structured relay problem responses.
- Show consent links before waiting when browser launch is disabled or unavailable, and preserve the selected profile/environment in reconnect guidance.
- Update vulnerable CLI dependencies.
- Replace the .NET reference backend with a TypeScript Cloudflare Worker and D1 auth-state storage, encrypted handoffs, and atomic one-time exchange.
- Retire duplicated backend listing/setup compatibility endpoints; current listing and seller workflows remain in the CLI.
- Add automated CLI, Worker, and documentation checks, plus contribution templates and dependency update configuration.
- Add a two-seller CLI/relay integration check and document the public hosted-agent model's remaining gaps.
- Require trusted HTTPS relay transport outside loopback development, reject auth redirects, and safely open Windows consent URLs.
- Avoid automatic mutation retries and honor bounded read retry delays; rate-limit relay refresh requests.
- Correct business policy example fields and stale remote-revocation wording.
- Restrict OAuth by default to permitted immutable seller IDs, including refresh and final token handoff.
- Add a Cloudflare setup portal with live readiness checks and a Grok Bot handoff.
- Scan Git history and repository files for leaked secrets in CI.
- Remove unused OAuth constants and the unused Fulfillment permission from default consent scopes.
- Ignore unrelated loopback browser requests during login and show safe recovery instructions for expired or already-used relay callbacks.

## 0.1.0

Initial CLI package version: local seller profiles, backend-relayed OAuth, machine-readable discovery, and Trading/Inventory listing workflows. This entry records the package baseline and does not imply an npm publication date.
