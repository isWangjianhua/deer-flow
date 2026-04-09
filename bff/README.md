# BFF Service

A lightweight FastAPI BFF for frontend-facing authentication, conversation ownership, and DeerFlow Gateway proxying.

## Purpose

This service is the only public backend entry for the frontend.

It sits between the frontend and DeerFlow Gateway and is responsible for:

- authenticating users
- enforcing basic access control
- mapping public `conversation_id` to internal DeerFlow `thread_id`
- proxying chat streaming requests to DeerFlow Gateway
- proxying uploads and artifact downloads
- applying basic rate limiting and audit logging

DeerFlow Gateway is treated as an internal agent runtime and should not be exposed directly to end users.

## Scope

Current scope:

- login session validation
- current user lookup
- conversation create/list/delete
- SSE chat proxy
- upload proxy
- artifact download proxy
- audit log hooks
- basic rate limiting

Out of scope for the first version:

- billing and payment
- complex subscription plans
- usage metering and quota deduction
- admin back office
- deep business workflow orchestration

## Architecture

```text
Frontend
  -> BFF (FastAPI)
    -> auth / ownership / rate limit / audit
    -> DeerFlow Gateway (internal)
```

Key rule:

- the frontend only sees `conversation_id`
- DeerFlow `thread_id` is never exposed to the frontend
- BFF owns the mapping between them

## Directory Layout

```text
bff/
├── app/
│   ├── api/
│   ├── clients/
│   ├── core/
│   ├── db/
│   ├── models/
│   ├── repositories/
│   ├── schemas/
│   ├── services/
│   ├── sse/
│   └── main.py
├── tests/
├── pyproject.toml
├── .env.example
├── README.md
└── AGENTS.md
```

## API Design Principles

This service exposes its own public API. It should not mirror DeerFlow Gateway 1:1.

Public-facing rules:

- use `conversation_id`, not DeerFlow `thread_id`
- normalize error responses
- keep auth and ownership checks in BFF
- preserve streaming behavior for chat
- avoid leaking internal DeerFlow implementation details

## Initial Endpoints

- `POST /auth/login`
- `GET /me`
- `POST /conversations`
- `GET /conversations`
- `POST /conversations/{conversation_id}/messages/stream`
- `POST /conversations/{conversation_id}/uploads`
- `GET /conversations/{conversation_id}/artifacts/{path}`
- `DELETE /conversations/{conversation_id}`

## Core Modules

- `api/`
  - public HTTP and SSE routes
- `clients/deerflow.py`
  - outbound HTTP/SSE client for DeerFlow Gateway
- `services/`
  - auth, ownership, rate limit, orchestration
- `repositories/`
  - persistence access
- `models/`
  - user, conversation, audit log
- `sse/proxy.py`
  - SSE passthrough and event adaptation

## Data Model

Minimum first-version tables:

### users

- `id`
- `email` or external auth subject
- `status`
- `created_at`

### conversations

- `id`
- `user_id`
- `deerflow_thread_id`
- `title`
- `status`
- `created_at`
- `updated_at`

### audit_logs

- `id`
- `user_id`
- `conversation_id`
- `action`
- `request_id`
- `metadata`
- `created_at`

## Environment Variables

Example:

```env
BFF_ENV=development
BFF_HOST=0.0.0.0
BFF_PORT=9000

DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/bff
BFF_SECRET_KEY=change-me
BFF_ACCESS_TOKEN_EXPIRE_MINUTES=10080

DEERFLOW_GATEWAY_BASE_URL=http://127.0.0.1:8001
DEERFLOW_TIMEOUT_SECONDS=300

BFF_RATE_LIMIT_ENABLED=true
BFF_LOG_LEVEL=INFO
```

## Local Development

### 1. Install dependencies

```bash
cd bff
uv sync
```

### 2. Configure environment

```bash
cp .env.example .env
```

Update at least:

- `DATABASE_URL`
- `BFF_SECRET_KEY`
- `DEERFLOW_GATEWAY_BASE_URL`

### 3. Start the service

```bash
cd bff
uv run uvicorn app.main:app --host 0.0.0.0 --port 9000 --reload
```

### 4. Start DeerFlow Gateway

From the repository root, run DeerFlow in Gateway mode separately:

```bash
make dev-pro
```

Confirm the BFF can reach the configured DeerFlow Gateway URL.

## Request Flow

### Create conversation

1. frontend sends request to BFF
2. BFF authenticates user
3. BFF creates DeerFlow thread if needed
4. BFF stores `conversation_id -> deerflow_thread_id`
5. BFF returns only `conversation_id`

### Stream message

1. frontend calls BFF stream endpoint with `conversation_id`
2. BFF validates ownership
3. BFF loads mapped DeerFlow `thread_id`
4. BFF calls DeerFlow streaming endpoint
5. BFF forwards SSE events to frontend
6. BFF logs request and result metadata

## Security Rules

- DeerFlow Gateway must stay internal
- never expose raw DeerFlow `thread_id`
- every conversation access must verify `user_id`
- uploads and artifact downloads must go through ownership checks
- normalize downstream errors before returning them to frontend

## Testing

Recommended test layers:

- `tests/clients/`
  - DeerFlow client behavior
- `tests/services/`
  - ownership and business rules
- `tests/api/`
  - auth, conversations, SSE endpoints

Run tests:

```bash
cd bff
uv run pytest
```

## Future Work

Possible next steps after the first version:

- external identity provider integration
- subscription and quota model
- richer audit events
- background tasks for cleanup
- usage analytics
- admin tooling

## Additional Docs

- `docs/README.md` - BFF documentation index
- `docs/ARCHITECTURE.md` - service boundaries, request flow, and deployment model
- `docs/API.md` - public API contract and downstream mapping rules
- `docs/DEVELOPMENT.md` - local development workflow and implementation notes
