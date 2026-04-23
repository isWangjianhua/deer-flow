# BFF Architecture

The BFF is the product-facing backend for the current DeerFlow frontend. It
sits between the browser and the DeerFlow gateway/runtime so that the frontend
does not need to know about internal thread identifiers or runtime route
shapes.

## Topology

```text
browser
  -> frontend pages and same-origin route handlers
    -> /api/bff/* -> BFF (FastAPI)
      -> auth + ownership + contract shaping
      -> DeerFlow gateway compatibility routes
```

Important detail:

- the browser usually talks to `/api/bff/*` on the frontend origin
- Next.js route handlers then reach the BFF through
  `DEER_FLOW_INTERNAL_BFF_BASE_URL`

## Core Boundary

The BFF owns the public conversation contract.

External identifier:

- `conversation_id`

Internal runtime identifier:

- `deerflow_thread_id`

That mapping lives in the BFF database and is never supposed to leak back to
browser code.

## Auth Modes

The BFF supports two runtime auth modes:

- `local`
  - seeded demo user
  - BFF-issued JWT access token
  - self-service username/password registration
- `oidc`
  - accepts external bearer `id_token`
  - validates issuer, audience, and JWKS
  - maps the external identity into a local BFF user

The BFF does not own browser redirect/callback OIDC UX. The frontend does.

## Main Request Flows

### Conversation creation

1. frontend calls `POST /api/bff/conversations`
2. BFF authenticates the user
3. BFF asks the DeerFlow gateway to create a thread
4. BFF stores `conversation_id -> deerflow_thread_id`
5. BFF returns the public conversation record

### Message streaming

1. frontend calls `POST /api/bff/conversations/{id}/messages/stream`
2. BFF verifies the user owns the conversation
3. BFF forwards the mapped `thread_id` to the gateway runtime
4. BFF forwards selected runtime context values such as:
   - `user_id`
   - `model_name`
   - `thinking_enabled`
   - `reasoning_effort`
   - `is_plan_mode`
   - `subagent_enabled`
5. BFF proxies SSE frames back to the browser
6. BFF refreshes cached conversation detail asynchronously after the stream

### Resource proxying

Conversation-scoped routes for:

- suggestions
- artifacts
- uploads
- uploaded-file deletion

all perform ownership validation first, then proxy the mapped runtime
`thread_id`.

## Stream Contract

The BFF normalizes gateway stream events into a frontend-oriented contract.

Typical event names include:

- `message.started`
- `message.delta`
- `reasoning.delta`
- `message.completed`
- `tool.started`
- `tool.progress`
- `tool.completed`
- `tool.failed`
- `run.failed`

This keeps frontend chat rendering stable even if the runtime internals or raw
gateway event shapes continue to evolve.

## Persistence Model

Current tables:

- `users`
- `user_identities`
- `conversations`

The BFF uses SQLite by default for local development.

## Current Boundary Shape

What is true today:

- the main chat route is BFF-backed
- `/workspace/account` is BFF-backed
- model discovery is BFF-backed
- readonly lead-agent memory is BFF-backed
- browser-facing `/agents*` CRUD is BFF-backed
- `POST /agents/{agent_name}/conversations` is BFF-backed
- any conversation carrying `agent_name` must pass both conversation ownership
  checks and agent-visibility checks anywhere that conversation is accessed
  through ownership-checked conversation routes
- MCP and skills still remain frontend bridge routes to Gateway-facing APIs
