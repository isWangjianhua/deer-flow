# AGENTS.md

Guidance for coding agents working in `frontend/`.

## Service Role

The frontend is a Next.js application with two important integration layers:

- browser-facing UI and page state
- same-origin server bridge routes that hide internal backend topology from the browser

Today the main workspace chat and account flows are BFF-backed. Some older workspace surfaces still
use Gateway-facing runtime semantics behind Next.js bridge routes.

## Current Architecture

```text
browser
  -> frontend pages/components
  -> same-origin Next.js routes under /api/*
     -> /api/bff/* -> FastAPI BFF
     -> selected /api/* bridge routes -> DeerFlow Gateway
```

### Primary ownership

- `src/core/bff-chat/`
  - owns the BFF conversation contract for create/list/detail/stream
- `src/app/api/bff/`
  - owns the browser-to-BFF same-origin bridge
- `src/core/auth/` and `src/app/api/bff/me/`
  - own browser auth state and the authenticated BFF `/me` bridge
- `src/components/workspace/input-box.tsx`
  - owns model, mode, upload, and suggestion entry points for the main chat path
- `src/core/threads/`
  - still owns legacy Gateway-thread workflows that have not been moved to BFF semantics

## Hard Boundaries

Agents must preserve these boundaries:

- Do not add new browser-visible direct calls to DeerFlow Gateway.
- Prefer same-origin `/api/bff/*` when a capability is BFF-owned.
- Prefer same-origin Next.js server bridge routes when a capability is not yet BFF-owned.
- Do not expose internal BFF or Gateway base URLs in browser-only code unless explicitly required.
- Treat `conversation_id` as the public identifier for the BFF-backed chat flow.
- Do not reintroduce raw runtime `thread_id` semantics into the BFF-backed chat UI.

## Current Browser API Split

### BFF-backed browser paths

- `/api/bff/me`
- `/api/bff/models`
- `/api/bff/conversations/*`
- `/api/bff/conversations/*/artifacts/*`
- `/api/bff/conversations/*/suggestions`
- `/api/bff/conversations/*/uploads`

### Same-origin Next.js bridge paths that still proxy Gateway-facing APIs

- `/api/memory`
- `/api/mcp`
- `/api/skills`
- `/api/agents`

### Canonical local entrypoints

- `http://localhost:2026`
  - the most complete same-origin dev path through nginx
- `http://localhost:3000`
  - valid for focused frontend work, but still a partial-bridge workflow

Direct browser access to Gateway `:8001` is non-canonical.

## Streaming Rules

Streaming UX is a product boundary. When editing chat streaming behavior:

- preserve event order
- preserve reasoning/tool interleaving
- avoid duplicate optimistic user messages
- avoid duplicate reasoning snapshots
- keep tool labels and parameters updating during the live stream
- do not move completed-stream normalization into display components if state-layer fixes are enough

## Account Page Rules

`/workspace/account` is a product page, not only a debug surface.

When editing it:

- keep browser session state and BFF connection status as the primary content
- keep raw diagnostics behind a collapsible panel
- preserve both local-auth and OIDC flows
- avoid turning the page back into raw JSON-first UI

## Directory Responsibilities

- `src/app/`
  - pages and route handlers only
- `src/components/`
  - presentational and interaction UI
- `src/core/auth/`
  - browser auth/session behavior and BFF user loading
- `src/core/bff-chat/`
  - BFF chat protocol, stream parsing, state, and message assembly
- `src/core/threads/`
  - legacy runtime-thread semantics
- `src/core/models/`, `src/core/uploads/`, `src/core/artifacts/`
  - browser-facing helpers for the current same-origin API surface
- `src/app/api/`
  - same-origin bridge routes only; keep transport concerns here, not in components

## Coding Rules

- Keep browser code same-origin by default.
- Keep route handlers thin and transport-focused.
- Keep protocol normalization in `src/core/`, not in JSX.
- Add types at API boundaries.
- Follow the existing split between BFF-backed chat state and legacy thread state.
- Use ASCII unless a file already requires Unicode.
- Add brief comments only where the control flow is genuinely non-obvious.

## Tests

When behavior changes materially, prefer tests in this order:

1. boundary tests for route ownership and fetch targets
2. `src/core/bff-chat/` state and message assembly tests
3. component-level regression tests for chat/account UI boundaries
4. Playwright coverage for end-to-end auth/chat behavior when the local environment supports it

## If Unsure

If a change makes the browser more aware of Gateway internals, it is probably the wrong direction.

If a change crosses the BFF-backed chat path and the legacy thread path, keep the ownership boundary
explicit rather than blending them together.
