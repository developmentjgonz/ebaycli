# One app, multiple sellers, and agents

Start with the deployment owner's store. The Worker defaults to `SELLER_ACCESS_MODE=restricted` and only returns sessions for configured immutable eBay user IDs. Invited sellers can be added later to the secret allowlist; they each sign in to their own eBay account and authorize the deployment's eBay application. The relay exchanges that seller's consent for a separate seller session. The CLI then uses that session for the selected store; the relay has no global selected seller.

This describes the implemented data flow. It does not establish approval by eBay for a public service or arbitrary third-party agents. Read the [eBay authorization guide](https://developer.ebay.com/develop/guides/sell/authorization) alongside the deployment's actual distribution and data-handling model.

## Owner first, invited sellers later

`ALLOWED_EBAY_USER_IDS` is a Worker secret containing a comma-separated list of immutable `userId` values returned by the eBay Commerce Identity API. The Worker resolves the account through eBay during login and refresh, then compares that ID exactly before returning a seller session. Usernames, IDs supplied by the caller, and the first successful login do not establish ownership. The final one-time exchange checks the allowlist again.

Restricted mode is the default even when the setting is absent. Missing allowed IDs or an unknown mode leave OAuth inactive with a configuration error. Health and public pages can still be hosted while the owner obtains their app keyset and verified ID; deployment does not require temporarily opening OAuth to everyone.

For an existing working profile on a trusted relay, `ebay --profile YOUR_PROFILE auth status --json` returns its eBay-resolved `ebayUserId`. Confirm that profile belongs to the intended owner before using the ID. Otherwise, use your own eBay developer app's User Token flow and a private client for [Commerce Identity `getUser`](https://developer.ebay.com/api-docs/commerce/identity/resources/user/methods/getUser). Keep tokens outside Git, model prompts, and shared logs. See [deployment](deployment.md) for storing the verified ID as a secret.

Removing an ID stops new handoffs and refreshes. It does not immediately revoke access tokens already issued to local clients; those remain usable until they expire or eBay revokes them. Denied login discards its handoff but does not itself revoke consent already granted to the app at eBay.

Explicit `SELLER_ACCESS_MODE=open` removes the seller-ID restriction. That setting is an operator choice, not approval for a public service. The eBay policy, deletion, agent data, and shared-limit responsibilities below still apply before inviting other sellers or advertising public access.

## Where access lives

```text
Seller A → eBay consent to your app → session A → CLI / agent A → store A
Seller B → eBay consent to your app → session B → CLI / agent B → store B
                    Your relay and eBay app keyset serve both logins
```

An agent does not obtain access to your personal store merely by using your app's relay. Its seller token identifies the authorized account. Mixing profile files or sharing credentials can still give an agent access to the wrong store.

The application secret stays on the relay. The seller access and refresh tokens are returned to the CLI and saved in its local profile file. The temporary D1 handoff is encrypted, short-lived, and consumed once. Anyone who can read the local profile file can use its seller credentials within the grant's scopes.

`--profile` selects an account; it is not a boundary between users on a shared server. Concurrent agents should use separate `XDG_CONFIG_HOME` directories and operating-system access controls. See [profiles](profiles.md). The current browser login expects the browser and CLI on the same machine; a remotely hosted agent needs an explicitly designed credential-provisioning flow. This repository does not implement a hosted user dashboard or account database.

## Your app's limits are shared

Clients' eBay calls remain associated with your application even when made directly from their machines. The relay's per-IP limit covers OAuth start, exchange, and refresh; it does not centrally throttle listing calls from distributed clients or impose a per-seller daily budget.

Monitor your actual eBay app limits before onboarding more sellers. The documented defaults include 5,000 Trading calls and 25,000 Account calls per day; the [API call limits page](https://developer.ebay.com/develop/get-started/api-call-limits) describes the other APIs. Actual assigned limits may differ. Higher limits or restricted API production access may need an [Application Growth Check](https://developer.ebay.com/grow/application-growth-check).

The CLI retries safe reads and honors bounded `Retry-After` intervals. It does not automatically repeat writes after uncertain network or server failures. Inspect the account before repeating an uncertain create: the first request may already have succeeded.

## Seller authorization and agent data

Listing writes require `--apply`; seller setup writes act immediately. These are command behavior, not a separate seller-approval system. A local agent with a token can call eBay directly outside this CLI. A hosted product must define and enforce its own allowed operations, approvals, and tenant access.

Sold-listing output can include `buyerUsername`. Profiles, exported drafts, and agent logs can also contain account or listing data. Send only necessary fields to an agent, restrict access to its logs and files, and document which providers receive data and how long they retain it. Never send profile files, access tokens, or refresh tokens in model prompts.

eBay recommends server-side refresh-token storage. The current local-file design needs review for your distribution model; local file permissions alone do not establish that eBay accepts a public token-to-agent service. See [OAuth guidance](https://developer.ebay.com/develop/guides/sell/authorization).

## Deletion handling is a public-service gap

The current notification POST endpoints return 204 and discard their payloads. They do not verify notification signatures, identify the affected account, purge its temporary handoffs, or remove profiles, exports, and logs from client machines. Grant revocation detected on the next API request clears a local session; it does not delete all copies of user data.

eBay's [account-deletion guide](https://developer.ebay.com/develop/guides/sell/marketplace-user-account-deletion) treats acknowledgement and deletion as separate responsibilities. Before serving other sellers, implement and verify the applicable signed-notification processing and deletion flow across the data you control, including retention/backups and service providers, or obtain an exemption that eBay confirms applies to your actual data flow. Having no permanent backend account table does not itself demonstrate an exemption.

## Confirm the public agent model with eBay

The [API License Agreement](https://developer.ebay.com/join/api-license-agreement) makes the developer responsible for users' conduct. Section 4.2 limits sublicensing and users' programmatic API control. Section 9.10 prohibits training on eBay Content; section 8.5 restricts sending Restricted API data to non-eBay AI without written consent. Section 9.5 restricts deriving prices from eBay Content.

These terms need review for a distributed CLI that returns seller tokens to user-controlled agents. OAuth consent does not settle those questions. Ask eBay Developer Support to confirm the specific architecture, API set, agent permissions, AI providers, and data retention before advertising unrestricted public access. This repository does not supply that approval or deployment-specific user terms.

## What is verified

The automated suites cover CLI behavior, Worker routes, restricted owner access, allowed invited IDs, account denial, encrypted handoffs, expiry, replay, refresh, and fixtures. [check-integration.mjs](../scripts/check-integration.mjs) additionally exercises two allowed synthetic sellers through actual HTTP, the real CLI loopback callback, and the SQL migration. Their sessions stay separate and output redacts tokens. eBay responses are simulated.

Local Wrangler checks validate Worker/D1 execution. They do not confirm live browser consent, production listing writes, policy acceptance, Cloudflare account configuration, or eBay approval. See [testing](../TESTING.md) and [deployment](deployment.md).
