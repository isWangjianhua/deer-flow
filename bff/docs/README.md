# BFF Documentation

The BFF is the public backend boundary for the main frontend auth and chat
flows. It is intentionally narrower than the DeerFlow gateway and exists to
keep product-facing contracts stable while the runtime continues to evolve.

## Recommended Reading Order

1. `../README.md`
2. `ARCHITECTURE.md`
3. `API.md`
4. `DEVELOPMENT.md`
5. `ROADMAP.md`

## What The BFF Owns

- authentication and current-user lookup
- local-user bootstrap and local self-registration
- OIDC bearer-token validation for protected requests
- `conversation_id -> deerflow_thread_id` mapping
- ownership checks for conversation-scoped resources
- SSE proxying and normalization for the BFF-backed chat path
- model discovery for the frontend product path

## What It Does Not Own

- DeerFlow runtime internals
- raw thread lifecycle as a public frontend contract
- MCP, skills, and agents as first-class BFF APIs
- browser-side OIDC redirect and callback UX
  - the frontend owns that experience
