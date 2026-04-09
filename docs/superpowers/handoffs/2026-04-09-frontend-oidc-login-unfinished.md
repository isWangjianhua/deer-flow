# Frontend OIDC Login Unfinished Work

## Current State

The `feat/frontend-oidc-login` branch already includes the first usable frontend auth slice:

- reusable `frontend/src/core/auth/` boundary
- Better Auth OIDC provider wiring
- server-side `/api/bff/me` bridge route
- minimum `/workspace/account` proof page

This is enough to continue product work, but the branch is not fully finished.

## Unfinished Items

### 1. Frontend lint is not clean yet

At the time of merge, `pnpm lint` still reports these issues:

- `frontend/src/server/better-auth/client.ts`
  - import order: `better-auth/client/plugins` should be ordered before `better-auth/react`
- `frontend/src/server/better-auth/config.ts`
  - replace `Boolean(clientId || clientSecret || discoveryUrl)` with a lint-compliant nullish-safe check

These are mechanical fixes, not architecture blockers.

### 2. Final documentation pass is incomplete

The branch includes basic auth documentation updates, but it still needs a fuller pass to document:

- the expected OIDC environment setup for local development
- how `/api/bff/me` chooses the upstream BFF URL
- the intended relationship between `/workspace/account` and future protected routes

### 3. No UI-level integration test exists yet

The current verification is based on:

- Node.js module tests for `core/auth` and `server/better-auth`
- `frontend` typecheck
- local build verification

There is still no browser-level integration test for:

- clicking the OIDC login button
- restoring a Better Auth session in the UI
- fetching `/api/bff/me` after login

### 4. Chat integration has not started

This branch intentionally stops before:

- conversation creation from the frontend
- chat streaming through the BFF
- upload and artifact UI

Those should continue in the next branch or next implementation slice.

## Recommended Next Step

If development resumes from `master`, the next work should be:

1. clean the remaining frontend lint issues
2. verify `/workspace/account` against a real OIDC provider and BFF instance
3. start the `frontend-bff-chat-stream` slice on top of this auth foundation
