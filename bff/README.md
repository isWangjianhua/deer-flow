# DeerFlow BFF

The BFF is a FastAPI service that sits between the frontend and the DeerFlow
gateway/runtime. Its job is to expose stable, ownership-aware product APIs so
the browser does not need to know about internal runtime thread identifiers or
gateway route structure.

## What It Owns

- authentication
- current-user lookup
- local self-registration
- OIDC bearer-token validation for protected requests
- browser-facing Agent CRUD management
- `conversation_id -> deerflow_thread_id` mapping
- ownership checks for conversation resources
- model discovery for the product path
- SSE proxying for the BFF-backed chat flow
- authenticated DeerFlow Gateway calls through a single client boundary

## What It Does Not Own

- DeerFlow runtime internals
- raw thread ids as a public contract
- MCP or skills as first-class BFF APIs
- Agent Chat, bootstrap conversation flow, or final agent ownership semantics
- browser redirect/callback OIDC UX
  - the frontend owns that experience

## Public Routes

| Route | Purpose |
| --- | --- |
| `POST /auth/login` | local login |
| `POST /auth/register` | local registration |
| `GET /me` | current user |
| `GET /models` | model list for the frontend |
| `GET /memory` | readonly user-scoped Memory for the frontend |
| `GET /agents` | list browser-facing agents through the BFF |
| `GET /agents/check?name=...` | validate agent name availability |
| `GET /agents/{agent_name}` | load agent detail |
| `POST /agents` | create an agent through the BFF |
| `PUT /agents/{agent_name}` | update an agent through the BFF |
| `DELETE /agents/{agent_name}` | delete an agent through the BFF |
| `POST /conversations` | create a conversation |
| `GET /conversations` | list conversations |
| `GET /conversations/{conversation_id}` | conversation detail |
| `PATCH /conversations/{conversation_id}` | rename, pin, or unpin a conversation |
| `DELETE /conversations/{conversation_id}` | delete a conversation and mapped DeerFlow thread |
| `POST /conversations/{conversation_id}/messages/stream` | SSE chat stream |
| `POST /conversations/{conversation_id}/suggestions` | follow-up suggestions |
| `GET /conversations/{conversation_id}/artifacts/{path}` | artifact access |
| `POST /conversations/{conversation_id}/uploads` | upload files |
| `GET /conversations/{conversation_id}/uploads` | list uploaded files |
| `DELETE /conversations/{conversation_id}/uploads/{filename}` | delete uploaded file |

## Agent Management (Phase A)

The BFF now owns the browser-facing Agent CRUD contract through `/agents*`.
These routes authenticate the current user, proxy to DeerFlow Gateway
`/api/agents*`, and normalize downstream transport errors into stable BFF
errors.

In this phase:

- browser code should stop calling `/api/agents*` directly
- agent data semantics may still remain global
- Agent Chat, bootstrap conversation flow, and user ownership remain later
  roadmap phases

## Local Development

Install dependencies:

```bash
cd bff
uv sync
cp .env.example .env
```

The preferred full-stack launcher is:

```bash
cd ..
make dev-pro
```

That starts `Gateway + BFF + Frontend + nginx`.

If you only need the BFF process:

```bash
cd bff
uv run uvicorn app.main:app --host 0.0.0.0 --port 9000 --reload
```

You still need the DeerFlow gateway running separately because the BFF proxies
runtime requests to it.

## Configuration

Non-sensitive defaults come from the repository-root `config.yaml` under
`bff:`:

- bind host and port
- auth mode defaults
- DeerFlow gateway base URL
- timeout settings

Sensitive values stay in `bff/.env`, especially:

- `DATABASE_URL`
- `BFF_SECRET_KEY`

## DeerFlow Client Boundary

`app/clients/deerflow.py` is the only place that should talk to DeerFlow
Gateway directly from the BFF. When BFF code needs user-scoped Mem0 memory, it
must call the client with `user_id=...`; the client is responsible for sending
`X-User-Id` to Gateway. The readonly `GET /memory` route follows this rule and
is now the browser-facing Memory contract. Keep that header logic centralized
there instead of rebuilding it in routes or services.

## Read Next

- `docs/ARCHITECTURE.md`
- `docs/API.md`
- `docs/DEVELOPMENT.md`
- `docs/ROADMAP.md`
