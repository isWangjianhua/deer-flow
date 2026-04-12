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

The current product loop works, and several originally planned cleanup phases are now complete.

Still-open architectural boundaries:

- some frontend surfaces still depend on same-origin Next.js bridge routes rather than BFF-owned APIs
- direct `:3000` development still behaves differently from the canonical `:2026` path
- conversation lifecycle remains incomplete beyond create/list/detail/stream

## Phase 1: Fix The Startup Mismatch

Status: completed

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

Status: completed

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

Status: completed for the main BFF-backed chat path

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

Status as of `2026-04-12`: implemented with same-origin Next.js server bridges for `memory`, `MCP`,
`skills`, and `agents`. The browser no longer needs the raw Gateway base URL for those workspace
surfaces, but those APIs are still not BFF-owned.

### Required work

Move one of these ways:

- directly into BFF, or
- behind stable same-origin Next.js server bridges

Priority APIs:

1. memory
2. MCP
3. skills
4. agents

Additional ownership requirements:

1. `memory` must stop behaving like a global runtime file and become user-scoped state keyed by
   `user_id`
2. `MCP`, `skills`, and `agents` must each define an explicit owner model before they are treated as
   multi-user-safe resources
3. browser and external clients must stop depending on Gateway `/api/threads/*` for user-facing
   resource access
4. user-state resources should cross a BFF ownership boundary before they can resolve an internal
   runtime `thread_id`

Memory-provider direction:

- keep the API boundary flexible enough to swap the current file-backed memory implementation for a
  user-scoped provider such as `mem0`
- treat `mem0` or a similar managed memory layer as an implementation choice behind the BFF contract,
  not as a browser-visible dependency

### Success criteria

- the browser no longer needs to know the raw Gateway base URL for normal workspace usage
- the same-origin routing story is consistent across chat and settings/product surfaces
- memory reads and writes are isolated per `user_id`
- no browser-visible user workflow depends directly on Gateway `/api/threads/*`
- user-facing resources resolve internal `thread_id` values only after BFF ownership checks

## Phase 5: Productize `/workspace/account`

Status: completed

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

Status: completed for the current same-origin bridge model

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

1. memory/MCP/skills/agents ownership decision
2. user-scoped memory design and provider migration path
3. conversation lifecycle
4. legacy runtime-thread cleanup outside the BFF-backed chat path
5. production hardening and governance

## Non-Goals For This Plan

These are useful, but not the main priority for this alignment pass:

- billing
- usage metering
- admin tooling
- deep governance features
- database hardening

Those should come after the browser/BFF/Gateway boundary is coherent.
