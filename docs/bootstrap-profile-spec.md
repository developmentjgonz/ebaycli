# Bootstrap and Profile State Spec

Status: draft

This document describes the profile/bootstrap behavior for `ebaycli`.

## Goal

Make `ebaycli` behave cleanly from a brand-new local state while preserving an existing connected seller profile such as `freshlifeusa` unless the user explicitly changes or removes it.

## Product intent

- The CLI is the main product surface.
- The CLI owns most eBay API interaction logic.
- The backend is required for the recommended production OAuth path:
  - OAuth callback relay/token pass-through
  - required hosted auth/legal surfaces
  - operational health and eBay notification endpoints
- The CLI must not embed eBay app credentials. Each deployment-owned backend supplies its own eBay developer app configuration.

## Desired startup states

### 1. Brand-new local state
No config file or no usable profile exists.

Expected behavior:
- `ebay status` or `ebay auth status` should fail clearly and calmly.
- The CLI should explain the recommended setup path:
  1. configure a backend relay URL
  2. start backend-relayed OAuth
  3. verify status
- The error should tell the user exactly what to run next.

### 2. Existing connected profile
A stored session already exists for a seller account, for example `freshlifeusa`.

Expected behavior:
- The CLI should preserve that connection by default.
- The CLI should not silently destroy or replace the stored session.
- The CLI should only clear the session on explicit logout/disconnect/reset.

## Supported auth modes

### Backend relay mode
Use for production.

Expected profile shape includes:
- `backendBaseUrl`
- `ebaySession` after login

Expected behavior:
- login bootstrap is initiated through the backend
- eBay redirects to the backend HTTPS callback
- backend exchanges the eBay code and redirects to CLI localhost with a one-time exchange code
- refresh is delegated through the backend
- normal listing/status/setup flows continue through the CLI

### Direct mode
Use only as an advanced/private testing fallback when the user has a workable direct OAuth setup.

Expected profile shape includes:
- `selfManagedApp.clientId`
- `selfManagedApp.clientSecret`
- `selfManagedApp.runame`
- optional accepted/declined/privacy URLs
- `ebaySession` after login

Expected behavior:
- login and refresh can be handled directly by the CLI
- listing/status/setup flows continue through the CLI

Non-negotiable:
- eBay app credentials are not embedded in the npm package
- the backend is deployment-owned infrastructure, not a way for arbitrary users to bypass eBay developer setup and compliance

## Existing connection preservation rule

If a valid stored seller connection exists, the CLI should prefer preserving and using it over forcing unnecessary reconfiguration.

For the current project intent, that means the last working `freshlifeusa` connection should remain intact unless the user explicitly chooses to:
- log out
- disconnect
- replace profile settings
- migrate to a different auth mode

## Brand-new bootstrap UX

From zero local state, the CLI should make the next step obvious.

Desired guidance shape:
- If no backend URL and no direct app config exist:
  - tell the user to set the backend URL and start auth
- If backend relay mode is configured:
  - tell the user to start auth
- If direct mode is configured:
  - allow direct auth but label it as advanced/private testing

## Non-goals for this spec

This spec does not require or permit:
- automatic profile migrations that silently destroy working sessions
- silent rewriting of old profiles
- embedded app credentials in the CLI
- broader architecture changes beyond the current CLI-first direction

## Practical principle

Prefer:
- preserving working seller connectivity
- minimal surprise
- explicit migration/reset steps

Avoid:
- breaking an existing connected profile just because the profile shape is older
- broad cleanup changes when a narrow runtime fix is enough

## Suggested future implementation approach

When revisiting this later, prefer a small, explicit approach:
1. detect whether the profile is backend-relay, direct, or unconfigured
2. preserve any existing connected seller session
3. give targeted guidance when config is incomplete
4. keep logout/disconnect/reset explicit and user-driven
