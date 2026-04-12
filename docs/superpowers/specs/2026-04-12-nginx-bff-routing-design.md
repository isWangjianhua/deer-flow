# Nginx BFF Routing Alignment Design

Date: 2026-04-12

## Summary

Align `docker/nginx/nginx.local.conf` and `docker/nginx/nginx.conf` to the current BFF-first browser boundary without changing frontend or BFF APIs in the same round.

This round is intentionally narrow:

- keep `Gateway` and `LangGraph` runtime ownership intact
- keep the existing Next.js same-origin bridge model intact
- stop preserving outdated browser-visible direct-to-Gateway routes where the frontend now owns same-origin bridge routes

## Problem

The repository has already moved several browser-facing flows away from direct Gateway access:

- model discovery
- conversation resources
- settings-style APIs such as memory, MCP, skills, and agents

However, both nginx configs still explicitly proxy several of those routes directly to Gateway. This causes two problems:

1. `:2026` traffic shape does not match the intended browser boundary.
2. Local and container nginx behavior remain coupled to legacy direct-Gateway assumptions.

## Goals

- Make local and container nginx route ownership consistent.
- Ensure browser-visible same-origin API paths fall through to `frontend` where Next.js bridge routes exist.
- Preserve current working BFF chat streaming behavior.
- Avoid introducing new backend ownership changes in this round.

## Non-Goals

- Do not redesign `/api/bff/*` to bypass Next.js and talk directly to BFF.
- Do not move new APIs into BFF in this round.
- Do not change frontend request code in this round.
- Do not change Gateway or BFF application behavior in this round.

## Current Ownership Model

### Keep Direct nginx-to-Gateway ownership

These remain explicitly owned by Gateway or LangGraph:

- `/api/langgraph/*`
- `/api/langgraph-compat/*`
- any existing runtime-specific health/docs/internal paths that are already explicitly bound to backend services

### Keep frontend-owned SSE bridge behavior

These remain explicitly routed to `frontend` with the current SSE-safe proxy settings:

- `/api/bff/conversations/<id>/messages/stream`

This route must continue to preserve:

- disabled proxy buffering
- long read/send timeouts
- connection headers suitable for server-sent events

### Move browser-visible API ownership to frontend

These routes should no longer be explicitly proxied to Gateway by nginx:

- `/api/models`
- `/api/memory`
- `/api/mcp`
- `/api/skills`
- `/api/agents`
- `/api/threads/*`

After this change, they should fall through to the `frontend` upstream so Next.js route handlers and same-origin bridge code own the browser boundary.

## Chosen Approach

Use a minimal nginx-only alignment:

1. Remove or relax direct-Gateway route blocks for browser-visible bridge-owned APIs in both nginx configs.
2. Let those requests resolve through the existing frontend catch-all.
3. Keep explicit SSE handling and direct runtime routing unchanged.

## Alternatives Considered

### Option 1: nginx-only alignment

Pros:

- lowest risk
- matches current frontend implementation
- keeps this round small and verifiable

Cons:

- does not by itself finish the long-term BFF-first migration

### Option 2: route `/api/bff/*` directly to BFF

Pros:

- architecturally closer to final BFF-first target

Cons:

- conflicts with the current Next.js bridge ownership
- risks breaking auth/session handling and internal base URL assumptions

### Option 3: full boundary rewrite in one round

Pros:

- cleanest end state

Cons:

- too much surface area
- hard to verify safely in one change

## Implementation Outline

### Files

- `docker/nginx/nginx.local.conf`
- `docker/nginx/nginx.conf`

### Changes

1. Remove explicit direct-Gateway route blocks for:
   - `/api/models`
   - `/api/memory`
   - `/api/mcp`
   - `/api/skills`
   - `/api/agents`
   - `/api/threads/*`
2. Keep the frontend catch-all route in place so these requests land on Next.js.
3. Keep direct routing for LangGraph, Gateway compat, and any runtime-specific backend paths.
4. Keep the existing BFF SSE route block unchanged except for any comment cleanup required for clarity.

## Validation

Validation after implementation should confirm:

1. `docker/nginx/nginx.local.conf` and `docker/nginx/nginx.conf` express the same route ownership.
2. Requests for `/api/models`, `/api/memory`, `/api/mcp`, `/api/skills`, `/api/agents`, and `/api/threads/*` are no longer explicitly sent to Gateway by nginx.
3. Chat streaming through `/api/bff/conversations/<id>/messages/stream` still uses SSE-safe proxying.
4. Existing direct runtime routes still point to Gateway or LangGraph as before.

## Risks

- Some legacy frontend paths may still expect nginx to proxy directly to Gateway. If found, those paths should be treated as separate follow-up work rather than folded into this round.
- If local and container configs diverge during editing, `:2026` and container behavior will split again. The change must be made to both files together.

## Follow-up Work

- Evaluate whether `/api/bff/*` should eventually route directly to BFF rather than through Next.js bridge routes.
- Continue shrinking legacy Gateway-visible browser routes until nginx only exposes stable frontend and BFF ownership boundaries.
