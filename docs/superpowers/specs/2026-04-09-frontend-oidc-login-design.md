# Frontend OIDC Login Design

## Overview

This spec defines the next frontend authentication step after the BFF gained OIDC bearer `id_token` validation.

The current backend can validate external OIDC identities and map them into local BFF users, but the frontend still lacks a product-grade browser login flow and a reusable auth bridge for BFF requests.

This slice uses the existing `frontend` application and its current `better-auth` foundation, but the design intentionally avoids coupling future product work to the entire DeerFlow frontend codebase. The goal is to extract a reusable auth-facing module boundary while landing the first real browser OIDC flow in the current frontend.

## Goals

- Add browser-based OIDC login to the existing `frontend` app using the current `better-auth` setup.
- Introduce a reusable frontend auth module boundary instead of spreading auth logic across pages.
- Establish a frontend auth bridge that exposes session and BFF-auth concerns through a stable interface.
- Prove the minimum end-to-end auth loop:
  - browser login
  - frontend session
  - current-user display
  - authenticated call to BFF `/me`

## Non-Goals

- Full chat UI integration
- Conversation create/list/stream integration
- Upload or artifact UI
- Multi-provider selection UI
- Packaging auth as an external shared library
- Replacing the existing `better-auth` foundation

## Recommended Direction

Use the existing `better-auth` implementation as the backend/frontend auth engine, but place a new reusable module in `frontend/src/core/auth/` as the consumer-facing boundary for the rest of the app.

That module should own:

- provider-facing config access
- session access
- current-user resolution
- login/logout actions
- BFF auth bridge behavior

Pages and future product features should depend on the new `core/auth` layer, not directly on `better-auth` internals.

## Architecture

```text
Browser
  -> frontend auth UI
    -> core/auth
      -> better-auth integration
      -> session state
      -> BFF auth bridge
        -> BFF /me
```

There are two boundaries that matter:

1. `better-auth` remains the implementation detail for browser/session auth
2. `core/auth` becomes the stable interface future product code should reuse

## First-Version Module Design

### `frontend/src/core/auth/`

This new module should act as the frontend auth boundary.

It should expose:

- current session access
- current frontend user access
- login action
- logout action
- BFF auth request helper

The rest of the frontend should not need to import `better-auth` directly once this layer exists.

### `frontend/src/server/better-auth/`

This existing area remains the implementation backend for:

- provider configuration
- session creation and lookup
- server-side session helpers

This slice should reuse it rather than replacing it.

### BFF Auth Bridge

The auth module should define a single place where frontend session state becomes BFF-facing auth context.

The exact internal mechanism may evolve later, but consumers should use one stable surface such as:

- `getBffAuthHeaders()`
- or an equivalent BFF request helper

This keeps future frontend migration and future BFF auth changes isolated to one place.

## Public Frontend Outcome

The first slice should let the current frontend do all of the following:

- initiate OIDC login
- recover the authenticated session on load
- show the current frontend user state
- make an authenticated call to BFF `/me`
- show the mapped BFF user result or a meaningful auth failure

This is enough to prove that:

- browser OIDC login works
- frontend session handling works
- frontend-to-BFF auth bridging works

## Request Flow

### Login flow

1. user clicks login in the frontend
2. frontend auth module triggers the configured OIDC login flow through `better-auth`
3. browser completes provider login
4. frontend rehydrates session state
5. UI reflects authenticated user state

### BFF bridge flow

1. frontend calls an auth-bound helper to prepare a BFF request
2. auth module resolves the session and required credentials
3. frontend calls BFF `/me`
4. BFF validates identity and maps it to a local BFF user
5. frontend receives stable BFF user data

## Scope Boundary

This slice intentionally stops before chat integration.

That means it does not yet change:

- message send flows
- SSE chat handling
- conversation pages
- upload and artifact flows

Those will build on the auth boundary created here.

## Testing Strategy

This slice should cover:

1. auth module behavior for session access
2. login/logout wiring through the auth boundary
3. current-user resolution through the auth boundary
4. BFF auth bridge request construction
5. one minimum authenticated frontend-to-BFF `/me` path

Tests should prefer module-level and integration-level coverage over page-specific incidental behavior.

## Migration Value

This design is intentionally not "frontend-dependent" in the long-term product sense.

Why:

- the initial implementation lands in the current `frontend`
- the reusable boundary is `core/auth`, not the page tree
- future custom frontends can migrate the auth boundary more easily than they could migrate page-coupled login logic

## Future Path

Once this slice exists, the next steps can be split cleanly:

1. frontend chat stream integration through the BFF
2. upload and artifact UI through the BFF
3. broader protected-route and session UX improvements
4. eventual extraction of the frontend auth boundary into a more reusable internal package if needed

## Implementation Guidance

Keep this slice focused on auth infrastructure and the smallest useful end-to-end proof.

That means:

- reuse `better-auth`
- create a reusable `core/auth` boundary
- do not mix in chat UI work
- do not overbuild packaging or monorepo abstractions
- keep future migration in mind, but optimize for a usable first implementation in the current frontend

## Implementation Notes

- the first bridge implementation uses a same-origin Next.js route at `/api/bff/me`
- the bridge keeps provider token handling on the server side instead of exposing it to arbitrary client components
- the first user-facing proof page is `/workspace/account`
