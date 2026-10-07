# Security policy

The project is an early release. Security fixes target the current development branch and latest published CLI release; older releases are not maintained separately.

## Reporting a vulnerability

Please do not post credentials, tokens, or exploit details in a public issue. Use [GitHub private vulnerability reporting](https://github.com/developmentjgonz/ebaycli/security/advisories/new) when available. If private reporting is unavailable, contact the maintainer at the address listed in [cli/package.json](cli/package.json) to arrange a private report.

Include the affected version, reproduction steps, likely impact, and sanitized logs. There is no guaranteed response-time commitment.

## Credential boundaries

- The npm package does not contain eBay app credentials. Each relay deployment configures its own credentials server-side.
- The CLI stores seller access and refresh tokens in its local profile file. Protect that file and do not upload it to issues, source control, or chat logs.
- The reference backend temporarily handles seller tokens during OAuth handoff and refresh. Protect its database, encryption key, secret configuration, and backups.
- A deployment operator is responsible for HTTPS, supported runtime patches, access controls, retention, and the public privacy policy. The sample legal text is a starting point for the operator to review and replace.

See [profiles](docs/profiles.md) for local storage and [deployment](docs/deployment.md) for relay configuration.

The [secret audit](docs/secret-audit.md) records the repository, history, and package scans, their limits, and the safeguards enforced in CI.
