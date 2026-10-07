# Connect your own store to Grok Bot

The dedicated [Grok Bot](https://docs.x.ai/grok-bot/overview) runs on a persistent cloud computer with a browser, terminal, and filesystem. Install this CLI there and complete eBay consent in that computer's browser. Your Cloudflare relay handles the application credentials; the Bot's computer holds your seller session.

The deployed [setup portal](https://ebaycli-relay.developmentjgonz.workers.dev) checks relay availability and generates a handoff you can copy into your Bot. It does not display listings, connect the store itself, or run a Bot. Login remains disabled until the operator configures the eBay app and permitted immutable seller ID described in [deployment](deployment.md).

## Install on the Bot's computer

Ask the Bot to use a current Node.js 22+ release and install from source into its durable workspace:

```bash
git clone --branch codex/public-repo-cleanup https://github.com/developmentjgonz/ebaycli.git /workspace/ebaycli
cd /workspace/ebaycli
npm --prefix cli ci
npm --prefix cli run build
node cli/dist/index.js guide --json
```

The branch above contains the TypeScript cleanup while it is under review. Use `main` once those changes are merged. The package has not been published to npm.

Grok's [computer documentation](https://docs.x.ai/grok-bot/computer-and-apps) identifies `/workspace` as durable storage. It also explains that Bots under one user share files, browser sessions, and credentials. A separate Bot or CLI profile does not isolate credentials from your other Bots. Use a dedicated account or another genuine access boundary if you need that separation. Installations outside the durable workspace may need rebuilding after recovery.

## Complete consent on that same computer

Keep the login command running while the Bot opens the displayed authorization URL in its cloud browser:

```bash
cd /workspace/ebaycli
node cli/dist/index.js --profile own-store config set --backend-url https://ebaycli-relay.developmentjgonz.workers.dev --json
node cli/dist/index.js --profile own-store auth login --environment production --no-open --timeout-seconds 600 --json
```

Take over the Bot's browser for your eBay sign-in, verification, and consent. Do not paste passwords, one-time codes, seller tokens, or profile-file contents into chat. Completing this consent in your laptop's browser would send the localhost callback to your laptop instead of the Bot's computer.

The CLI prints the consent URL to its error stream while it waits. Its final JSON result redacts the seller tokens. This does not make the stored credentials harmless: anyone able to read the profile file can use the grant. See [profiles](profiles.md) for storage and permissions.

## Verify access with reads first

```bash
node cli/dist/index.js --profile own-store auth status --json
node cli/dist/index.js --profile own-store status --json
node cli/dist/index.js --profile own-store listings list --limit 5 --json
```

Check that the account identity and environment match your intended store before asking the Bot to change anything. These commands can require seller API permissions and account readiness even after consent succeeds. A healthy relay is not evidence that the account is connected or ready to sell.

Start the Bot with this operating instruction:

> Use the `own-store` profile. Read `guide --json` and `llms` before choosing a workflow. Start with status and listing reads. Keep tokens and profile files out of chat and logs. Show me the plan and ask before using `--apply` or running seller setup commands, which write immediately. After an uncertain write failure, inspect the store before trying again. Do not change prices, publish, end listings, or alter policies without my approval.

That instruction is a Bot policy, not a technical permission barrier. The CLI's `--apply` requirement helps review changes, but an agent holding seller tokens can call eBay directly. A future hosted agent service needs server-enforced permissions and approvals.

## What it can manage today

The CLI supports listing reads, exports, listing creation/update/end workflows, seller policies, inventory locations, and readiness checks. Supported behavior differs between Trading/classic and Inventory listings; consult the [support matrix](../cli/SUPPORT_MATRIX.md).

It does not provide complete order management, buyer messaging, refunds, shipping-label purchase, or fulfillment. A working connection cannot make Grok manage every part of a store through this repository. Add and verify those capabilities separately before delegating them.

## Additional sellers and data

This deployment starts with restricted seller access. Other sellers require their own consent, an allowed immutable seller ID, and separate protected credentials. Do not put several customers on the same Grok account or rely on profiles to separate them.

Keep buyer and account data out of model prompts unless the integration actually needs it and the applicable eBay terms permit that use. Before inviting other sellers, address the [public hosting and eBay policy gaps](hosting-model.md), including deletion handling, app-wide quotas, and the particular agent distribution model. OAuth consent alone does not establish eBay approval.

## Verification boundary

Automated tests exercise real CLI/relay HTTP communication, SQL state, redaction, refresh, and isolated synthetic sellers, with eBay responses simulated. The Cloudflare site can be live while OAuth remains intentionally inactive. A live owner login and the three read checks above must succeed on the Bot's computer before this setup is considered connected. No production listing write is part of that verification.
