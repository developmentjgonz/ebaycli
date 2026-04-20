# Bootstrap and Profile State Spec

Status: draft

This document describes the profile/bootstrap behavior for `ebaycli`.

## Goal

Make `ebaycli` behave cleanly from a brand-new local state while preserving an existing connected seller profile such as `freshlifeusa` unless the user explicitly changes or removes it.

## Product intent

- The CLI is the main product surface.
- The CLI owns most eBay API interaction logic.
- The backend is a thinner optional companion for:
  - OAuth callback relay/token pass-through when needed
  - required hosted auth/legal surfaces
  - optional companion endpoints
- The CLI must not provide a shared public eBay auth mode. Every user-owned install supplies its own eBay developer app credentials.

## Desired startup states

### 1. Brand-new local state
No config file or no usable profile exists.

Expected behavior:
- `ebay status` or `ebay auth status` should fail clearly and calmly.
- The CLI should explain the two valid setup paths:
  1. self-managed app flow with direct CLI OAuth
  2. self-managed app flow with optional companion-backend callback relay
- The error should tell the user exactly what to run next.

### 2. Existing connected profile
A stored session already exists for a seller account, for example `freshlifeusa`.

Expected behavior:
- The CLI should preserve that connection by default.
- The CLI should not silently destroy or replace the stored session.
- The CLI should only clear the session on explicit logout/disconnect/reset.

## Supported auth modes

### Self-managed direct mode
Use when the user provides their own eBay app credentials and the CLI can complete OAuth without a hosted relay.

Expected profile shape includes:
- `selfManagedApp.clientId`
- `selfManagedApp.clientSecret`
- `selfManagedApp.runame`
- optional accepted/declined/privacy URLs
- `ebaySession` after login

Expected behavior:
- login and refresh can be handled directly by the CLI
- normal listing/status/setup flows continue through the CLI

### Self-managed companion-relay mode
Use when the user provides their own eBay app credentials and also configures the optional reference backend for hosted OAuth callback, privacy, and health surfaces.

Expected profile shape includes:
- `backendBaseUrl`
- `selfManagedApp.clientId`
- `selfManagedApp.clientSecret`
- `selfManagedApp.runame`
- optional accepted/declined/privacy URLs
- `ebaySession` after login

Expected behavior:
- login bootstrap may be initiated through the companion backend
- refresh may be delegated through the companion backend
- listing/status/setup flows continue through the CLI

Non-negotiable:
- the companion backend does not replace user-owned eBay app credentials
- the companion backend is not a shared public OAuth application for arbitrary CLI users

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
- If no backend URL and no self-managed app config exist:
  - explain both setup options
- If direct self-managed mode is intended:
  - tell the user to configure app credentials and start auth
- If companion-relay mode is intended:
  - tell the user to set the backend URL, configure app credentials, then start auth

## Non-goals for this spec

This spec does not require or permit:
- automatic profile migrations that silently destroy working sessions
- silent rewriting of old profiles
- shared public auth mode in the CLI
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
1. detect whether the profile is direct self-managed or companion-relay self-managed
2. preserve any existing connected seller session
3. give targeted guidance when config is incomplete
4. keep logout/disconnect/reset explicit and user-driven
