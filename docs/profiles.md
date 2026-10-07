# Local profiles

A profile selects a relay URL and the seller session stored on your machine. The default profile is `default`; use the global `--profile` flag to keep sandbox and production separate.

## First connection

After [deploying a relay](deployment.md), run:

```bash
ebay --profile sandbox config set --backend-url https://relay.example.com --json
ebay --profile sandbox auth login --environment sandbox --json
ebay --profile sandbox status --json
```

If using the source build, replace `ebay` with `node cli/dist/index.js` from the repository root. Use `--environment production` for a production seller account.

`config status --json` shows redacted configuration and bootstrap guidance. `auth status --json` and `status --json` contact eBay, and may refresh the session through the relay.

## Storage and compatibility

Profiles live in `~/.config/ebaycli/backend-profiles.json`. When `XDG_CONFIG_HOME` is set, the file is under `$XDG_CONFIG_HOME/ebaycli/` instead.

The historical filename is intentional: upgrades reuse existing sessions without silently migrating or clearing them. A profile contains its name, `backendBaseUrl`, output preference, and an `ebaySession` after login. The session includes seller tokens, environment, marketplace, expiration, and any policy/location defaults.

Tokens are local credentials stored in the profile file. On POSIX systems the CLI restricts its config directory to mode 700 and saved profile file to mode 600. Windows uses the account's filesystem access controls. Do not commit or share this file. Configuration and login output redact access and refresh tokens.

Changing configuration preserves the existing session. Logging in again replaces the selected profile's session. A revoked grant or explicit logout/disconnect clears that session. Other named profiles remain intact.

When moving to a different eBay app or environment, reconnect the selected profile rather than attempting to reuse incompatible seller tokens.

Only configure a relay you trust with your seller tokens: refresh sends the selected profile's refresh token to that operator. Relay URLs must use HTTPS, with HTTP allowed only for `localhost` or `127.0.0.1` development. Auth requests reject redirects; configure the final relay endpoint directly. Existing profile files remain readable, but an unsafe old URL must be replaced before relay calls can run.

## Multiple agents or sellers

A named profile separates stored sessions and defaults; it does not isolate files from another process running as the same operating-system user. Agents with access to the profile file can use its seller tokens.

Use a separate `XDG_CONFIG_HOME` directory for each agent or seller when running concurrent workers. Serialize operations that share one config directory: profile saves currently use a file read/modify/write without a cross-process lock, so overlapping logins or token refreshes can overwrite another process's changes. A hosted service also needs its own tenant isolation and secret storage; this local profile file is not a hosted account database.

## Logout and revocation

```bash
ebay --profile sandbox auth logout --json
```

Logout clears the local session while keeping its relay configuration.

```bash
ebay --profile sandbox auth disconnect --json
```

Disconnect also returns the My eBay navigation needed to remove the third-party grant. Follow that returned guidance to revoke eBay-side access; clearing a local file alone does not complete remote revocation.

## Troubleshooting

| Symptom | Next step |
| --- | --- |
| Missing relay URL | Run `config set --backend-url <url>`, then log in |
| Missing or revoked seller session | Run `auth login` for the intended environment |
| Relay unavailable | Check its HTTPS URL, deployment, and `/ready` response |
| OAuth callback times out | Complete consent in the browser on the machine running the CLI and retry login |
| Seller not ready to publish | Inspect `setup doctor --json`; resolve account, policy, location, and category requirements |
| Invalid config file | Preserve a backup, inspect the JSON, and correct it; do not delete a working profile as a routine repair |

The localhost handoff expects the browser and CLI on the same machine. Remote/headless browser handoff is not an established workflow.

`auth login --no-open` prints the consent URL to stderr before waiting, so you can open it yourself on that machine while keeping JSON output separate. It still requires the browser's redirect to the CLI's localhost listener; pasting a callback code is not supported.
