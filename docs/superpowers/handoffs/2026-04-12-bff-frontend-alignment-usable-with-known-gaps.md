# BFF / Frontend Alignment Handoff

## Date

- `2026-04-12`

## Current Status

This repository is now broadly usable on the BFF-backed chat path, but it is not yet fully
aligned to the target architecture of "browser only talks to BFF".

What is working:

- local BFF auth via `/workspace/account`
- BFF-backed conversation create/list/detail/stream
- repaired stream ordering, reasoning display, and post-completion refresh behavior
- restored model/mode controls in the UI code path
- canonical BFF chat route restored to `/workspace/chats/new`

What remains inconsistent:

- the frontend still depends on the DeerFlow Gateway model list path
- some artifact/runtime file paths still depend on DeerFlow Gateway routes
- direct browser requests to `http://127.0.0.1:8001` are fragile because gateway CORS is not the intended public contract

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

## Documentation Updated In This Slice

- `frontend/README.md`
- `bff/README.md`
- `bff/docs/ROADMAP.md`

These docs now describe:

- the canonical BFF chat route
- the current mixed BFF/gateway state
- why direct browser-to-gateway calls are fragile
- the next recommended consistency fixes

## Recommended Near-Term Follow-Up

Do not treat these as blockers for current use, but they are the next clear cleanup items:

1. add a BFF-owned model list endpoint such as `GET /models` and bridge it to `/api/bff/models`
2. move artifact and upload access behind BFF ownership checks
3. keep browser-facing local development same-origin, either through `nginx` or the Next.js bridge routes

## Practical Recommendation

For now, the mature setup is:

- frontend browser requests use same-origin `/api/bff/*`
- `nginx` or Next.js bridge routes handle internal forwarding
- DeerFlow Gateway stays an internal runtime dependency

That keeps the current version usable without forcing the unfinished BFF consistency work into this slice.
