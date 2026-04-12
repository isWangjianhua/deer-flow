# Gateway / BFF / Frontend / Nginx Review

## Date

- `2026-04-12`

## Scope

This review looked at the current `Gateway mode backend`, `BFF`, `frontend`, and `nginx`
configuration together, rather than treating them as separate implementation islands.

## Current Architecture Assessment

The current system is usable, and several formerly transitional gaps have already been closed.

What is already true:

- chat create/list/detail/stream semantics are BFF-owned
- browser auth flows are BFF-oriented
- Gateway mode can serve as the internal agent runtime
- `nginx` is the most complete same-origin browser entrypoint
- gateway-mode local startup launches BFF by default
- model discovery, main chat artifacts/uploads/suggestions, and account status now align with the BFF-backed path
- nginx ownership now lets bridge-owned browser APIs fall through to `frontend`

What is not yet fully true:

- the browser does not yet exclusively depend on BFF-owned APIs
- direct frontend development at `:3000` still behaves differently from the canonical `:2026`
  entrypoint
- some workspace surfaces still rely on same-origin Next.js bridges rather than BFF-owned APIs

## Layer Responsibilities

### Gateway mode backend

Should own:

- internal runtime execution
- model/runtime/tool-facing internal APIs
- artifact generation and internal thread resources

Should not be treated as:

- the main browser-facing public API

### BFF

Should own:

- auth
- ownership
- conversation semantics
- browser-safe streaming contract
- selected resource and settings proxies needed by the frontend

Currently missing:

- broader settings/resource proxy coverage inside the BFF itself
- conversation lifecycle completion beyond create/list/detail/stream

### Frontend

Should:

- prefer same-origin `/api/bff/*` and related server bridges
- avoid browser-visible dependency on raw Gateway URLs

Currently still Gateway-facing in places such as:

- memory
- MCP
- skills
- agents
- older runtime-thread surfaces outside the main BFF chat flow

### Nginx

This layer is not optional glue; it is part of the current runtime architecture.

It currently provides:

- same-origin browser entrypoint
- path-based routing to frontend, Gateway, and LangGraph-compatible paths
- central CORS behavior
- streaming/SSE buffering controls

It still remains the canonical same-origin browser entrypoint, but the direct browser-visible
Gateway route set has been reduced.

This is especially important because the Gateway currently assumes that browser CORS is handled by
`nginx`.

## Recommended Development Order

1. Decide whether memory, MCP, skills, and agents should become BFF-owned APIs or remain stable same-origin bridges.
2. Complete conversation lifecycle actions such as rename and delete.
3. Keep `nginx` documentation and route ownership aligned with the intended architecture.
4. Continue removing legacy runtime-thread assumptions outside the main BFF chat loop.

## Account Page Recommendation

The current account page is now productized enough for normal local use.

Recommended direction:

- primary content should remain account/session status
- local and OIDC flows should remain clearly separated
- raw `/me` and session payloads should stay behind collapsible diagnostics
- BFF and browser-session health should remain visually separated

## Practical Conclusion

For current users and developers:

- treat `http://localhost:2026` as the most mature local entrypoint
- treat direct `http://localhost:3000` development as a partial-bridge workflow
- treat direct browser access to Gateway `:8001` as non-canonical

The next work should focus on API-boundary cleanup before adding unrelated new features.
