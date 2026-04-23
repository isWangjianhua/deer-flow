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

Treat `README.md`, `ARCHITECTURE.md`, and `API.md` as the
current-source-of-truth trio for the BFF boundary. The roadmap remains useful
historical context, but it should not outrank the implemented route/docs pair.

## What The BFF Owns

- auth and current-user resolution
- `conversation_id -> deerflow_thread_id` mapping
- ownership checks for conversation-scoped resources
- browser-facing chat streaming and resource proxying
- read-only lead-agent memory reads
- `/agents*` CRUD routes and user-scoped agent visibility
- `POST /agents/{agent_name}/conversations` bootstrap for agent chat

## What It Does Not Own

- DeerFlow runtime internals
- raw `thread_id` as a public frontend contract
- MCP and skills as first-class BFF APIs
- browser-side OIDC redirect and callback UX
  - the frontend owns that experience
