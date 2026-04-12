# BFF / Frontend Alignment Handoff

## Date

- `2026-04-12`

## Current Status

This repository is now broadly usable on the BFF-backed chat path and substantially closer to the
target architecture of "browser only talks to BFF through a same-origin entrypoint".

What is working:

- local BFF auth via `/workspace/account`
- BFF-backed conversation create/list/detail/stream
- repaired stream ordering, reasoning display, and post-completion refresh behavior
- BFF-backed model/mode controls in the UI code path
- canonical BFF chat route restored to `/workspace/chats/new`
- BFF-backed artifacts, uploads, and follow-up suggestions for the main chat route
- same-origin bridge routing for memory, MCP, skills, and agents
- gateway-mode startup now launches BFF by default
- nginx route ownership now lets bridge-owned browser APIs fall through to `frontend`
- `/workspace/account` is now a product-facing account/status page with collapsible diagnostics

What remains inconsistent:

- memory, MCP, skills, and agents are same-origin from the browser, but they are still not BFF-owned APIs
- some legacy runtime file and thread surfaces still depend on Gateway-facing semantics behind server bridges
- direct browser requests to `http://127.0.0.1:8001` are still fragile because gateway CORS is not the intended public contract

## Four-Layer View

The stable deployment and local-dev picture now needs to be described as four layers, not three:

1. `Gateway mode backend`
2. `BFF`
3. `frontend`
4. `nginx` or Next.js same-origin bridge routes

The key architecture point is that the Gateway is an internal runtime service, while `nginx`
currently acts as the mature external entrypoint for browser traffic.

The remaining operational mismatch is not startup anymore; it is the split between BFF-owned APIs
and same-origin Next.js bridge routes that still proxy selected Gateway surfaces.

## Root Cause Notes

### Why the model selector looked "missing"

The model selector and mode selector were still rendered in `frontend/src/components/workspace/input-box.tsx`.

The visible problem came from empty labels:

- model label depends on `selectedModel?.display_name`
- mode label depends on a model-driven initialization path

When the browser failed to load `/api/models`, both controls could render with empty text and
look visually absent.

### Why `/api/models` was failing in local direct-frontend runs

The gateway endpoint itself was healthy, but the browser path was not:

- `GET http://127.0.0.1:8001/api/models` worked in `curl`
- browser requests to `8001` are cross-origin from `3000`
- the gateway currently relies on `nginx` for CORS handling

So the stable local contract is still same-origin proxying, not direct browser-to-gateway calls.

## Product Gaps Identified In Review

### Account page

`/workspace/account` is no longer only a verification/debug page. The main remaining gap there is
follow-on product depth, not the first productization pass.

What is already true:

- clearer browser session state
- BFF session / `/me` health
- connection diagnostics in a secondary debug panel

What still remains optional:

- deeper account and auth settings beyond session/status visibility

### API boundary cleanup

The next architecture cleanup should move more browser-visible functionality behind BFF or
same-origin server bridges:

- memory
- MCP
- skills
- agents

The launcher and local startup story are now aligned; remaining cleanup is about API ownership.

## Documentation Updated In This Slice

- `frontend/README.md`
- `bff/README.md`
- `bff/docs/ROADMAP.md`

These docs now describe:

- the canonical BFF chat route
- the importance of the `nginx` same-origin layer
- the current mixed BFF/gateway state
- why direct browser-to-gateway calls are fragile
- the next recommended consistency fixes

## Recommended Near-Term Follow-Up

Do not treat these as blockers for current use, but they are the next clear cleanup items:

1. decide whether memory, MCP, skills, and agents should stay same-origin Next.js bridge routes or become BFF-owned APIs
2. complete conversation lifecycle actions such as rename and delete
3. keep browser-facing local development same-origin, either through `nginx` or the Next.js bridge routes
4. continue shrinking legacy Gateway-thread assumptions outside the main BFF chat path

## Practical Recommendation

For now, the mature setup is:

- frontend browser requests use same-origin routes
- `nginx` is the most complete current entrypoint
- Next.js bridge routes handle only part of the same-origin story in direct `:3000` development
- DeerFlow Gateway stays an internal runtime dependency

That keeps the current version usable without forcing the unfinished BFF consistency work into this slice.
