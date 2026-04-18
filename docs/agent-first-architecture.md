# Agent-First eBay CLI Architecture

## Purpose
This document describes the recommended end-to-end architecture for evolving `ebaycli` into an **agent-first, local CLI product** with two supported auth modes:

1. **Shared mode** for low-friction onboarding
2. **Self-managed mode** for advanced users who want to bring their own eBay app

The core principle is that the **CLI remains the main product surface**. Listing workflows, drafting, validation, planning, review, and apply logic should stay local and agent-friendly. Hosted infrastructure should exist only where required by eBay auth or secret management.

---

## Current repo state
Today this repository is effectively built around one shipped auth model:

- the local CLI owns the eBay OAuth session for the current machine
- the backend keeps the shared eBay app secret server-side
- the backend exchanges and refreshes tokens, then executes listing operations with the token the CLI presents

That model works, but it couples auth and listing execution more tightly to the backend than is ideal for a future **agent-first local CLI**.

---

## Executive recommendation

### Recommended product shape
- keep the **CLI** as the primary experience
- keep **listing logic local** in the CLI wherever practical
- support two auth modes:
  - **shared**: shared eBay app + minimal auth broker backend
  - **self-managed**: user provides their own eBay app credentials and the CLI talks directly to eBay

### Product stance
- **default** should be shared mode
- **advanced escape hatch** should be self-managed mode

This gives the best tradeoff across:
- onboarding simplicity
- agent UX
- security of shared secrets
- eBay app registration constraints
- long-term flexibility

---

## Why this architecture exists

### eBay auth is not standard redirect-uri OAuth
For eBay user-token flows:
- the app must be registered in the eBay Developer Program
- the app gets a **Client ID**, **Client Secret**, and **RuName**
- the OAuth `redirect_uri` is effectively the **RuName**, not just an arbitrary raw callback URL
- the RuName config includes:
  - **Privacy Policy URL**
  - **Auth Accepted URL**
  - **Auth Declined URL**
  - display/flow settings

This means that even if the runtime experience is mostly CLI-local, eBay still expects a registered app footprint.

### Shared app vs self-managed app is the real product split
If many users share one eBay app:
- the shared **Client Secret** must not be shipped in every installed CLI
- token exchange and refresh should stay server-side

If a user owns their own eBay app:
- it is acceptable for their local CLI to hold their app secret
- the CLI can exchange and refresh directly with eBay

This yields the core rule:

- **shared app => shared auth broker**
- **user-owned app => CLI-only auth is acceptable**

---

## High-level architecture

```text
                     +----------------------+
                     |  Small static site   |
                     | privacy / success /  |
                     | declined pages       |
                     +----------+-----------+
                                |
                                |
        +-----------------------+-----------------------+
        |                                               |
        v                                               v
+---------------------+                       +---------------------+
| Shared mode users   |                       | Self-managed users  |
| local CLI           |                       | local CLI           |
+----------+----------+                       +----------+----------+
           |                                             |
           | login / token ops                           | login / token ops
           v                                             v
+-------------------------+                    +-------------------------+
| Shared auth broker      |                    | Direct eBay OAuth/token |
| holds shared secret     |                    | exchange from CLI       |
+------------+------------+                    +------------+------------+
             |                                              |
             +----------------------+-----------------------+
                                    |
                                    v
                             +-------------+
                             | eBay APIs    |
                             | OAuth + Sell |
                             +-------------+
```

---

## Core principles

1. **Agent-first UX**
   - structured CLI responses
   - plan/apply separation
   - safe defaults
   - self-describing guide surfaces

2. **Local-first listing execution**
   - drafting, validation, normalization, planning, and most workflow logic should stay in the CLI
   - the backend should not own business logic unless it must

3. **Minimal hosted surface area**
   - host only what eBay requires or what is necessary to protect shared secrets

4. **Auth-mode abstraction**
   - CLI commands should look the same across auth modes
   - only the auth/token layer changes underneath

---

## Components

## 1. Local CLI

### Responsibilities
- command parsing
- agent-facing guide surfaces
- listing draft parsing and normalization
- plan/apply flows
- validation before submission
- local profile/config storage
- token storage in self-managed mode
- calling eBay directly or through auth broker, depending on mode
- producing structured JSON for automation

### Desired command style
```bash
ebay auth login
ebay auth status
ebay listings pull sku:ABC --out listing.yaml
ebay listings create --file listing.yaml
ebay listings create --file listing.yaml --apply
ebay listings update sku:ABC --file patch.yaml --apply
ebay listings end sku:ABC --apply
ebay guide --json
```

### Agent-first requirements
- commands should support `--json`
- errors should be normalized and readable
- guide output should describe supported workflows and input schemas
- plan commands should explain proposed changes before apply

---

## 2. Shared Auth Broker Backend

### Only needed in shared mode
This backend should be intentionally small.
It exists to protect the shared eBay app secret and handle token operations for the shared app.

### Responsibilities
- store shared Client ID / Client Secret securely
- initiate user auth for the shared app
- exchange auth code for access + refresh tokens
- refresh tokens when needed
- optionally validate token/session state

### What it should not own
- listing business logic
- listing drafting workflows
- inventory normalization logic
- guide surfaces
- general seller workflow orchestration

### Product implication
The backend should become an **auth broker**, not the main product brain.

---

## 3. Static site

### Purpose
Satisfy the eBay app registration fields and redirect landing pages without requiring a full application server.

### Minimal pages
- `/privacy`
- `/auth/success`
- `/auth/declined`

### Notes
- GitHub Pages, Vercel static hosting, Netlify, or equivalent is enough
- these pages can be extremely small
- they should accurately describe how the application handles user data

### Sharing model
If all users authenticate through the same shared eBay app, then one shared static site is sufficient.

---

## 4. eBay app registration
Each eBay app has:
- Client ID
- Client Secret
- RuName for Sandbox
- RuName for Production

### What RuName is
RuName is eBay's redirect/auth configuration identifier.
It is linked to the app and represents the configured user-auth flow.

RuName ties together:
- display title
- privacy policy URL
- accepted URL
- declined URL

### Practical explanation
- **Client ID** identifies the application
- **RuName** identifies the redirect/auth configuration for that app
- **Accepted URL** is where eBay sends the browser after approval
- **Declined URL** is where the browser is sent if the user refuses

In eBay OAuth, `redirect_uri` is the **RuName value**.

---

## Auth modes

## Mode A: Shared mode

### Who it is for
- default users
- low-friction onboarding
- users who just want to install the CLI and connect their eBay account

### Flow
1. User installs CLI
2. User runs `ebay auth login`
3. CLI contacts shared auth broker
4. Broker starts OAuth flow using shared eBay app
5. User authenticates with eBay in browser
6. eBay redirects according to the shared app's RuName config
7. Broker exchanges auth code using shared client secret
8. CLI receives and stores local session material appropriate for shared mode
9. CLI performs listing operations locally using the resulting session

### Pros
- easiest onboarding
- best default UX
- no app-registration burden on the user
- one consistent auth flow

### Cons
- requires a small backend
- the shared app owner carries compliance/support responsibility
- rate limits are shared at the app level

---

## Mode B: Self-managed mode

### Who it is for
- advanced users
- agencies
- teams wanting full ownership
- users who want their own app limits and review path

### User-owned setup
The user supplies:
- their own Client ID
- their own Client Secret
- their own RuName
- their own privacy/accepted/declined URLs

### Flow
1. User creates their own eBay developer app
2. User configures RuName and required URLs
3. User stores their app credentials locally
4. User runs `ebay auth login`
5. CLI starts OAuth flow directly with eBay
6. CLI receives or imports the returned code
7. CLI exchanges the code directly with eBay using the local secret
8. CLI stores access and refresh tokens locally
9. CLI refreshes tokens locally when needed
10. CLI calls eBay directly

### Pros
- no shared backend needed
- user owns their auth footprint
- user owns their own app review/limits path
- clean for advanced users

### Cons
- significantly higher setup burden
- worse onboarding
- users must manage app registration and secrets

---

## Why self-managed should not be the default
If every user must:
- create an eBay developer app
- configure RuName
- host policy/accept/decline URLs
- manage secrets

then the product stops feeling like an agent-first CLI and starts feeling like a developer integration kit.

That is too much friction for the default experience.

---

## Recommended configuration shape

```yaml
auth:
  mode: shared # shared | self-managed

shared:
  brokerUrl: https://auth.example.com
  appLabel: joseph-shared-ebay-app

selfManaged:
  environment: production
  clientId: YOUR_CLIENT_ID
  clientSecret: YOUR_CLIENT_SECRET
  runame: YOUR_RUNAME
  privacyPolicyUrl: https://example.com/privacy
  acceptedUrl: https://example.com/auth/success
  declinedUrl: https://example.com/auth/declined

storage:
  profile: default
  tokenStore: keychain
```

### Storage recommendation
- macOS Keychain preferred for secrets/tokens
- encrypted local file fallback if needed
- never print secrets or tokens by default

---

## End-to-end auth flow details

## Shared mode
1. CLI loads profile
2. CLI sees `auth.mode=shared`
3. CLI asks broker for login bootstrap
4. Browser opens eBay consent flow
5. User approves access
6. Broker receives redirect/code and exchanges it
7. Broker returns local session material or broker-mediated session state
8. CLI stores the local session reference
9. CLI keeps listing logic local

## Self-managed mode
1. CLI loads profile
2. CLI sees `auth.mode=self-managed`
3. CLI builds auth URL using local Client ID and RuName
4. Browser opens eBay consent flow
5. User approves access
6. CLI receives or imports returned code
7. CLI exchanges the code directly with eBay
8. CLI stores tokens locally
9. CLI refreshes locally as needed
10. CLI calls eBay directly

---

## Security and ownership

## Shared mode
### App ownership
- the shared app owner owns the eBay app registration
- the shared app owner owns the privacy policy and redirect configuration
- the shared app owner is responsible for support/compliance posture of the shared app

### Security requirements
- client secret stays server-side
- broker logs must avoid leaking sensitive material
- token scopes should be minimized where possible
- backend should be hardened because it protects the shared secret

## Self-managed mode
### App ownership
- the user owns their app registration
- the user owns their RuName and secrets
- the user owns their app review and app limits

### Security requirements
- local secret storage should use keychain where possible
- CLI should redact tokens in logs and error output
- plaintext config secrets should be discouraged

---

## Rate limits and growth

### Shared mode implications
- API limits are tied to the shared app
- as usage grows, the shared app bears the pressure
- if needed, the shared app can go through eBay's **Application Growth Check** process for higher limits or restricted production access

### Self-managed mode implications
- each user/app owns its own app lifecycle, limits, and review path
- scaling is naturally segmented per app

### Product implication
Shared mode is best for onboarding and smaller-scale growth.
Self-managed mode is the escape hatch for users who want independence.

---

## Compliance notes

### What appears consistent with eBay's model
- official eBay APIs
- seller-authorized OAuth
- operations only on the authorized seller's account
- app registration with privacy/accepted/declined URLs

### What should remain accurate
- privacy policy must accurately describe data use
- users should know whether they are authorizing a shared app or their own app
- listing content, images, and category choices still need to comply with eBay policies

### Open question to verify
One thing not fully verified in prior research is whether localhost or `127.0.0.1` style accepted URLs are explicitly supported by eBay in RuName configuration.

Because of that, the safest documented path is:
- use hosted accepted/declined URLs
- do not assume localhost callback support unless confirmed by eBay support or validated in practice

---

## Repo evolution recommendation

## Phase 1: separate auth concerns from listing concerns
- keep CLI as the main product surface
- move toward local execution for listing logic
- reduce backend responsibilities to auth broker responsibilities for shared mode

## Phase 2: add explicit auth mode abstraction
- add `shared` and `self-managed` auth modes to config
- keep CLI commands identical across modes
- isolate the differences to the token/session layer

## Phase 3: harden shared mode
- minimal auth broker
- tiny static site for privacy/success/declined pages
- clear support/compliance language

## Phase 4: support self-managed mode
- local credential config
- local direct exchange/refresh
- local secure token storage
- keep the same listing UX

---

## Final recommendation

If building for real users now:

### Ship first
- **shared mode** as the default
- **small auth broker** for exchange/refresh only
- **small static site** for privacy/accept/decline
- **local CLI** for everything else

### Also support
- **self-managed mode** for advanced users

### Avoid
- forcing every user to create their own eBay app
- distributing a shared client secret in the CLI
- centralizing listing business logic in the backend when it could stay local

---

## Bottom line

The best version of `ebaycli` is:
- **agent-first**
- **local CLI first**
- **shared-first onboarding**
- **self-managed escape hatch**
- **minimal hosted auth surface**

In one sentence:

> Build `ebaycli` as a local, agent-first eBay CLI with two auth modes: a low-friction shared mode backed by a tiny auth broker, and a self-managed mode for advanced users who want to bring their own eBay app.
