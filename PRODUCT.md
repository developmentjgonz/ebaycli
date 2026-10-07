# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

The web surface is the optional relay's setup portal. The primary product is the self-managed command-line application in [`cli/`](cli/README.md).

## Users

The deployment owner connects their own eBay store and uses a dedicated Grok Bot's persistent cloud computer for local CLI workflows. The owner completes eBay sign-in, verification, and consent in that computer's browser.

Invited sellers are a later audience for this deployment. The relay already supports manually allowed sellers; each needs their own consent, an allowed immutable seller ID, and protected credentials. This portal does not provide self-service seller onboarding.

## Product Purpose

`ebaycli` lets a seller read listings, prepare changes, and run supported seller workflows from a local CLI. The web portal helps the owner inspect relay configuration and copy instructions for connecting the CLI on Grok Bot's computer.

Success means the configured relay can complete login and refresh, the intended seller's session is stored on the CLI's computer, and account and listing reads confirm the connection. A healthy relay or a copied handoff alone does not establish a connected store.

## Positioning

Seller operations run directly from the CLI against eBay. A deployment-owned relay holds eBay application credentials and completes OAuth exchange and refresh. The TypeScript Cloudflare Worker in [`backend/`](backend/README.md) is an optional reference implementation of that required relay interface.

There is no shared public authentication mode in the CLI, hosted seller account database, or hosted store dashboard.

## Operating Context

- `/cli` is TypeScript with Vitest and its own published-package boundary. `/backend` is a separate TypeScript Cloudflare Worker; D1 stores temporary OAuth state and encrypted one-time handoffs.
- The CLI and browser completing the loopback OAuth callback must run on the same computer. The portal provides commands and a Grok handoff; it does not start a Bot or authorize the seller itself.
- Production and sandbox are distinct environments. Selecting an environment updates the copied commands and profile choice; it does not change the deployment's configured credentials.
- Existing local profiles and the `backend-profiles.json` storage format must be preserved. Profiles choose accounts; they do not isolate users who share a computer or credentials.
- Use [`guide --json` and `llms`](cli/README.md) when selecting a workflow. The portal's setup sequence is documented in [`docs/grok-bot.md`](docs/grok-bot.md).

## Capabilities and Constraints

The portal reads actual `/health` and `/ready` results, distinguishes service availability, OAuth readiness, and seller access, and supports retry. It offers a native environment selector, copyable install/login/read commands, a complete Grok handoff, clipboard fallback, and public guidance links. It receives no seller credentials or store data.

The Worker defaults to restricted seller access. `ALLOWED_EBAY_USER_IDS` is a secret containing exact immutable IDs resolved through eBay. An empty allowlist leaves OAuth inactive; hosting public health and setup pages does not require opening seller access. See [`docs/deployment.md`](docs/deployment.md).

The CLI supports listing reads and exports, create/update/end plans, seller readiness, policies, and inventory locations. Listing writes use `--apply`; seller setup writes can act immediately and also require authorization. The Bot's instructions are an operating policy, not a server-enforced permission boundary. Consult the [`support matrix`](cli/SUPPORT_MATRIX.md) for Trading and Inventory differences.

Orders, refunds, returns, buyer messaging, shipping labels, and fulfillment are outside the current supported workflows. A public agent connector and other-seller onboarding UI are also absent.

Before serving invited sellers, resolve the distribution, agent permissions, data handling, signed deletion notification processing, and shared app-limit gaps documented in [`docs/hosting-model.md`](docs/hosting-model.md). OAuth consent does not establish deployment-specific eBay approval.

## Evidence on Hand

- Confirmed scope: own store first, dedicated Grok Bot computer, CLI as primary product, optional Worker reference, and later separately consenting invited sellers.
- Implementation: [`backend/src/pages.ts`](backend/src/pages.ts) contains portal structure and copy; [`backend/src/site.ts`](backend/src/site.ts) contains the actual style tokens and browser behavior.
- Local, uncommitted review captures: `.impeccable/review/desktop.jpg`, `.impeccable/review/mobile.jpg`, and `.impeccable/review/live.jpg`. The local captures show a configured synthetic sandbox; the live capture shows an online relay with OAuth and seller access needing setup. They do not demonstrate a connected production seller.
- No prior PRODUCT.md, formal FORM seed, QUALITY BAR card, or approved visual comp was available. [`DESIGN.md`](DESIGN.md) records the implemented visual system. This documentation does not supply retrospective approval evidence.
- Automated verification must use isolated synthetic sellers and simulated eBay responses. Never use a real seller profile or live eBay mutations for automated validation.

## Product Principles

1. Keep the CLI responsible for seller workflows and the relay responsible for deployment-owned OAuth.
2. Start with the owner's store; expand seller access deliberately with separate consent and credential protection.
3. Show the state actually verified, with a concrete path to recover from missing configuration.
4. Prepare and review seller changes before applying them; keep credentials out of chat and shared artifacts.
5. Describe supported capabilities and public-service gaps precisely.
