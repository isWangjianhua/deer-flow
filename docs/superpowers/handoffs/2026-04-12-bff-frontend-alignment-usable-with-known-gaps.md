# BFF / Frontend Alignment Handoff

## Date

- `2026-04-12`

## Current Status

This repository is now broadly usable on the BFF-backed chat path, but it is not yet fully
aligned to the target architecture of "browser only talks to BFF through a same-origin entrypoint".

What is working:

- local BFF auth via `/workspace/account`
- BFF-backed conversation create/list/detail/stream
- repaired stream ordering, reasoning display, and post-completion refresh behavior
- restored model/mode controls in the UI code path
- canonical BFF chat route restored to `/workspace/chats/new`

What remains inconsistent:

- the frontend still depends on the DeerFlow Gateway model list path
- some artifact/runtime file paths still depend on DeerFlow Gateway routes
- several workspace APIs such as memory, MCP, skills, agents, uploads, and suggestions still
  remain Gateway-facing in the frontend code
- `nginx` is an essential runtime layer but that role was under-documented before this review
- `make dev-pro` / `serve.sh --gateway` still do not start the BFF even though the frontend main
  chat and auth validation paths already depend on it
- direct browser requests to `http://127.0.0.1:8001` are fragile because gateway CORS is not the intended public contract

## Four-Layer View

The stable deployment and local-dev picture now needs to be described as four layers, not three:

1. `Gateway mode backend`
2. `BFF`
3. `frontend`
4. `nginx` or Next.js same-origin bridge routes

The key architecture point is that the Gateway is an internal runtime service, while `nginx`
currently acts as the mature external entrypoint for browser traffic.

The key operational mismatch is that the current gateway-mode launcher still starts only
`Gateway + Frontend + nginx`, not `BFF`.

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

`/workspace/account` is still a verification/debug page rather than a product-facing account page.

The current UI is useful for auth validation, but it should evolve into:

- clearer browser session state
- BFF session / `/me` health
- connection diagnostics in a secondary debug panel
- account and auth settings instead of raw JSON as the primary content

### API boundary cleanup

The next architecture cleanup should move more browser-visible functionality behind BFF or
same-origin server bridges:

- models
- artifacts
- uploads
- suggestions
- memory
- MCP
- skills
- agents

It should also align the launcher and documented local startup story with the already-BFF-backed
frontend routes.

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

1. add a BFF-owned model list endpoint such as `GET /models` and bridge it to `/api/bff/models`
2. move artifact and upload access behind BFF ownership checks
3. migrate suggestions and workspace settings-related APIs behind BFF or same-origin server bridges
4. turn `/workspace/account` into a product account page rather than leaving it as a debug-only view
5. keep browser-facing local development same-origin, either through `nginx` or the Next.js bridge routes

## Practical Recommendation

For now, the mature setup is:

- frontend browser requests use same-origin routes
- `nginx` is the most complete current entrypoint
- Next.js bridge routes handle only part of the same-origin story in direct `:3000` development
- DeerFlow Gateway stays an internal runtime dependency

That keeps the current version usable without forcing the unfinished BFF consistency work into this slice.
