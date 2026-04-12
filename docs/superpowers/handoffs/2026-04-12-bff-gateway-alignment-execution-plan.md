# BFF / Gateway Alignment Execution Plan

## Date

- `2026-04-12`

## Goal

Turn the current "usable but mixed" local stack into a clearer architecture where:

- browser traffic prefers same-origin entrypoints
- the BFF owns the main frontend-facing API contract
- Gateway remains an internal runtime service
- `nginx` and local startup scripts reflect the actual architecture instead of lagging behind it

## Summary

This plan is derived from:

- `docs/superpowers/handoffs/2026-04-12-bff-frontend-alignment-usable-with-known-gaps.md`
- `docs/superpowers/handoffs/2026-04-12-gateway-bff-frontend-nginx-review.md`
- `bff/docs/ROADMAP.md`

The current product loop works, but several key boundaries are still inconsistent:

- gateway-mode startup does not launch BFF
- frontend still depends on Gateway APIs directly in multiple places
- `nginx` still proxies many browser-visible routes straight to Gateway
- `/workspace/account` is still a verification/debug page rather than a product account page

## Phase 1: Fix The Startup Mismatch

### Objective

Make the canonical gateway-mode local startup match the already-BFF-backed frontend flow.

### Required work

1. Update `scripts/serve.sh` so gateway-mode startup either:
   - starts BFF automatically, or
   - provides an explicit BFF-first launcher path that becomes the documented default
2. Update `Makefile` targets to reflect the same story.
3. Keep docs and startup output aligned with the actual service graph.

### Success criteria

- the recommended local command starts every service required by:
  - `/workspace/account`
  - `/api/bff/*`
  - the BFF-backed chat page
- developers no longer need to infer that BFF must be started manually

## Phase 2: Move Model Discovery Behind BFF

### Objective

Remove the most visible remaining browser dependency on Gateway.

### Required work

1. Add a BFF model-list endpoint.
2. Add a same-origin frontend route for it, for example `/api/bff/models`.
3. Update frontend model loading to use the BFF path.
4. Ensure model/mode initialization continues to work in both local and OIDC auth modes.

### Success criteria

- the model selector no longer depends on browser access to Gateway `/api/models`
- local frontend behavior is consistent between `:2026` and `:3000`

## Phase 3: Move Artifacts, Uploads, And Suggestions Behind BFF

### Objective

Complete the main BFF-backed chat experience.

### Required work

1. Add BFF artifact access with ownership enforcement.
2. Add BFF upload proxy routes with ownership enforcement.
3. Add BFF suggestion generation or an equivalent same-origin server bridge.
4. Update frontend chat-related code to stop using raw Gateway thread routes directly.

### Success criteria

- artifact viewing/downloading in the main chat path no longer depends on direct browser Gateway access
- upload flows use BFF-owned access checks
- follow-up suggestions no longer call Gateway thread routes from the browser

## Phase 4: Clean Up Settings And Resource APIs

### Objective

Remove the remaining mixed browser-facing Gateway dependencies outside the main chat loop.

### Required work

Move one of these ways:

- directly into BFF, or
- behind stable same-origin Next.js server bridges

Priority APIs:

1. memory
2. MCP
3. skills
4. agents

### Success criteria

- the browser no longer needs to know the raw Gateway base URL for normal workspace usage
- the same-origin routing story is consistent across chat and settings/product surfaces

## Phase 5: Productize `/workspace/account`

### Objective

Turn the current account verification page into a user-facing account/status page.

### Required work

1. Replace the debug-first copy with product-facing account/session copy.
2. Split browser auth state, BFF `/me` health, and diagnostics into clearer sections.
3. Keep raw JSON and low-level diagnostics behind a collapsible debug panel.
4. Make local and OIDC auth flows clearer in the UI.

### Success criteria

- `/workspace/account` works as a real account page
- diagnostics are still available, but no longer dominate the page

## Phase 6: Align `nginx` With The Intended Architecture

### Objective

Reduce the gap between "current convenient routing" and "intended BFF-first routing".

### Required work

1. Review which `nginx` routes should still go directly to Gateway.
2. Re-point routes that are now owned by BFF.
3. Keep SSE, buffering, and timeout behavior correct for BFF stream paths.
4. Update docs so `nginx` route ownership is explicit.

### Success criteria

- `nginx` no longer silently preserves an outdated browser-to-Gateway contract
- path ownership is understandable from config and docs alone

## Suggested Delivery Order

If work resumes immediately, this is the recommended order:

1. startup alignment
2. BFF model proxy
3. artifacts/uploads/suggestions
4. memory/MCP/skills/agents cleanup
5. account page productization
6. final `nginx` route cleanup pass

## Non-Goals For This Plan

These are useful, but not the main priority for this alignment pass:

- billing
- usage metering
- admin tooling
- deep governance features
- database hardening

Those should come after the browser/BFF/Gateway boundary is coherent.
