# Gateway / BFF / Frontend / Nginx Review

## Date

- `2026-04-12`

## Scope

This review looked at the current `Gateway mode backend`, `BFF`, `frontend`, and `nginx`
configuration together, rather than treating them as separate implementation islands.

## Current Architecture Assessment

The current system is usable, but the architecture is still transitional.

What is already true:

- chat create/list/detail/stream semantics are BFF-owned
- browser auth flows are BFF-oriented
- Gateway mode can serve as the internal agent runtime
- `nginx` is the most complete same-origin browser entrypoint

What is not yet fully true:

- the browser does not yet exclusively depend on BFF-owned APIs
- the account page is not yet productized
- direct frontend development at `:3000` still behaves differently from the canonical `:2026`
  entrypoint
- the current gateway-mode launcher still does not start the BFF automatically

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

- model list proxy
- artifact proxy
- upload proxy
- broader settings/resource proxy coverage
- startup integration with the canonical gateway-mode dev flow

### Frontend

Should:

- prefer same-origin `/api/bff/*` and related server bridges
- avoid browser-visible dependency on raw Gateway URLs

Currently still Gateway-facing in places such as:

- models
- artifacts
- uploads
- suggestions
- memory
- MCP
- skills
- agents

### Nginx

This layer is not optional glue; it is part of the current runtime architecture.

It currently provides:

- same-origin browser entrypoint
- path-based routing to frontend, Gateway, and LangGraph-compatible paths
- central CORS behavior
- streaming/SSE buffering controls

It also still proxies many browser-visible resource and settings paths directly to Gateway, which
is useful today but keeps the architecture mixed.

This is especially important because the Gateway currently assumes that browser CORS is handled by
`nginx`.

## Recommended Development Order

1. Align `serve.sh` and the documented gateway-mode startup flow with the already-BFF-backed
   frontend by launching BFF or introducing an explicit BFF-first local launcher.
2. Add BFF model proxying and move the frontend model selector behind `/api/bff/*`.
3. Move artifacts and uploads behind BFF ownership checks.
4. Migrate suggestions plus settings/resource APIs such as memory, MCP, skills, and agents behind
   BFF or stable same-origin bridges.
5. Productize `/workspace/account` into a real account/settings page.
6. Keep `nginx` documentation and route ownership aligned with the intended architecture.

## Account Page Recommendation

The current account page is good enough for integration verification, but it is not yet a product UI.

Recommended direction:

- primary content should be account/session status
- local and OIDC flows should be described more clearly
- raw `/me` and session payloads should move into collapsible diagnostics
- BFF and browser-session health should be visually separated

## Practical Conclusion

For current users and developers:

- treat `http://localhost:2026` as the most mature local entrypoint
- treat direct `http://localhost:3000` development as a partial-bridge workflow
- treat direct browser access to Gateway `:8001` as non-canonical

The next work should focus on API-boundary cleanup before adding unrelated new features.
