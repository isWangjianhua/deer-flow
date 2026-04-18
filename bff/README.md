# BFF Service

A lightweight FastAPI BFF for frontend-facing authentication, conversation ownership, and DeerFlow Gateway proxying.

Authentication uses a provider-oriented internal architecture with two supported modes:

- `local` for seeded demo users and BFF-issued JWTs
- `oidc` for validating external bearer `id_token` credentials against an upstream issuer

Browser redirect and callback handling for OIDC remain out of scope in this slice.

## Purpose

This service is the public backend entry for the BFF-owned frontend flows.

Some remaining browser-visible APIs are still same-origin Next.js bridge routes
rather than BFF-owned endpoints.

It sits between the frontend and DeerFlow Gateway and is responsible for:

- authenticating users
- enforcing basic access control
- mapping public `conversation_id` to internal DeerFlow `thread_id`
- proxying chat streaming requests to DeerFlow Gateway
- providing a stable frontend-facing API boundary

DeerFlow Gateway is treated as an internal agent runtime and should not be exposed directly to end users.

## Scope

Current scope:

- login session validation
- current user lookup
- conversation create/list/detail
- SSE chat proxy
- local SQLite-backed conversation mapping
- seeded local demo user bootstrap
- provider-oriented auth internals with `local` and `oidc` auth modes
- OIDC bearer `id_token` validation for protected requests
- forwarding selected chat context fields such as `model_name` and reasoning settings to DeerFlow Gateway
- optionally pinning a default downstream `lead_agent` name for all BFF chat streams
- preparation for future browser-based OIDC redirect/callback flows, without enabling them yet

Out of scope for the first version:

- billing and payment
- complex subscription plans
- usage metering and quota deduction
- admin back office
- deep business workflow orchestration
- conversation deletion
- broader BFF ownership for MCP, skills, and agents
- runtime-owned long-term memory internals

## Architecture

```text
Browser
  -> nginx / Next.js same-origin routes
    -> /api/bff/* -> BFF (FastAPI)
      -> auth / ownership / rate limit / audit
      -> DeerFlow Gateway (internal)
```

Key rule:

- the frontend only sees `conversation_id`
- DeerFlow `thread_id` is never exposed to the frontend
- BFF owns the mapping between them

Important current caveat:

- the main chat page already uses BFF conversation semantics
- the main frontend chat/account/model/resource path no longer requires direct browser access to the
  DeerFlow Gateway
- MCP, skills, and agents are now same-origin from the browser, but they are still Next.js
  bridge routes rather than BFF-owned APIs
- long-term memory is no longer a browser-facing surface; BFF only forwards authenticated `user_id`
  into the runtime stream context so deerflow-harness can resolve Mem0-backed memory internally
- because the gateway currently expects `nginx` to handle CORS, direct browser requests to
  `http://127.0.0.1:8001` are not a stable local-development contract
- in local frontend-only dev, Next.js currently acts as a partial same-origin bridge for some
  gateway paths, but that is still transitional rather than the final architecture
- the current `serve.sh --gateway` / `make dev-pro` flow now starts the BFF automatically
- nginx route ownership has been aligned so browser-visible bridge-owned API paths fall through to
  `frontend` instead of being explicitly proxied to Gateway
- local self-registration is available only when `BFF_AUTH_PROVIDER=local`
- the first registration slice supports username/password only
- email verification and password reset are intentionally deferred

This means the current architecture is usable and much closer to the target boundary, but it is not
yet fully "frontend only talks to BFF".

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

## Current Endpoints

- `POST /auth/login`
- `POST /auth/register`
- `GET /me`
- `GET /models`
- `POST /conversations`
- `GET /conversations`
- `GET /conversations/{conversation_id}`
- `POST /conversations/{conversation_id}/messages/stream`
- `POST /conversations/{conversation_id}/suggestions`
- `GET /conversations/{conversation_id}/artifacts/{path}`
- `POST /conversations/{conversation_id}/uploads`
- `GET /conversations/{conversation_id}/uploads`
- `DELETE /conversations/{conversation_id}/uploads/{filename}`

Deferred:

- `DELETE /conversations/{conversation_id}`

## Core Modules

- `api/`
  - public HTTP and SSE routes
- `clients/deerflow.py`
  - outbound HTTP/SSE client for DeerFlow Gateway
- `services/`
  - auth and ownership orchestration
- `repositories/`
  - persistence access
- `models/`
  - user and conversation
- `sse/proxy.py`
  - SSE passthrough and event adaptation

## Data Model

Minimum first-version tables:

### users

- `id`
- `username`
- `password_hash`
- `status`
- `created_at`

### user_identities

- `id`
- `user_id`
- `provider`
- `subject`
- `email`
- `claims_json`
- `created_at`

### conversations

- `id`
- `user_id`
- `deerflow_thread_id`
- `title`
- `status`
- `created_at`
- `updated_at`

## Configuration Files

Non-sensitive BFF defaults are defined in the root `config.example.yaml` under the `bff:` section. Copy the root example to `config.yaml` and edit the `bff:` values you need:

- runtime defaults such as `bff_env`, `bff_host`, and `bff_port`
- auth mode defaults such as `bff.auth.provider` and OIDC discovery settings
- DeerFlow integration defaults such as `deerflow_gateway_base_url` and `deerflow_timeout_seconds`

Sensitive values stay in `bff/.env`:

```env
DATABASE_URL=sqlite:///./.data/bff.db
BFF_SECRET_KEY=change-me
```

If you need a non-default shared config path, set `DEER_FLOW_CONFIG_PATH` before starting the stack. The BFF also honors `BFF_CONFIG_PATH` as a narrower override.

## Local Development

### 1. Install dependencies

```bash
cd bff
uv sync
```

### 2. Configure BFF settings

```bash
cp .env.example .env
cp ../config.example.yaml ../config.yaml
```

Then adjust the `bff:` section in the root `config.yaml`.

Update `.env` at least:

- `DATABASE_URL`
- `BFF_SECRET_KEY`

Typical root `config.yaml` edits under `bff:` include:

- `auth.provider` if you want to switch between `local` and `oidc`
- `auth.oidc_issuer`, `auth.oidc_audience`, and `auth.oidc_jwks_url` when using `oidc`
- `deerflow.gateway_base_url` if Gateway runs elsewhere

The first slice seeds a local development user:

- username: `demo`
- password: `demo1234`

When `BFF_AUTH_PROVIDER=oidc`, the BFF expects incoming bearer `id_token` credentials from an external OIDC provider. This slice does not include browser redirect or callback handling, so frontends still need to obtain the token separately.

### 3. Start the full local stack

From the repository root:

```bash
make dev-pro
```

This starts `Gateway + BFF + Frontend + nginx`.

### 4. Start only the BFF for focused BFF work

```bash
cd bff
uv run uvicorn app.main:app --host 0.0.0.0 --port 9000 --reload
```

If you start the BFF this way, start Gateway separately instead of using `make dev-pro`:

```bash
cd backend
PYTHONPATH=. uv run uvicorn app.gateway.app:app --host 0.0.0.0 --port 8001 --reload
```

Confirm the BFF can reach the configured DeerFlow Gateway URL.

### 5. Important startup note

`make dev-pro` now launches the BFF as part of the gateway-mode local stack.

If you are testing:

- `/workspace/account`
- `/api/bff/*`
- the BFF-backed chat route

the default gateway-mode launcher should now provide the required BFF process on `:9000`.

## Frontend Integration Notes

Current recommended frontend path:

- browser code should prefer same-origin `/api/bff/*`
- Next.js server routes should forward to the internal BFF base URL
- any remaining gateway-specific browser path should be treated as transitional

Known integration gaps as of `2026-04-13`:

- MCP, skills, and agents are still same-origin Next.js bridge routes rather than BFF-owned APIs
- some legacy runtime-thread surfaces still exist outside the main BFF-backed chat path
- conversation lifecycle is still incomplete beyond create/list/detail/stream
- direct browser calls to the gateway are still fragile outside `nginx` because gateway CORS is not the intended public contract

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
4. BFF forwards supported chat context fields to DeerFlow Gateway
5. BFF calls DeerFlow streaming endpoint
6. BFF forwards SSE events to frontend
7. BFF logs request and result metadata

## Security Rules

- DeerFlow Gateway must stay internal
- never expose raw DeerFlow `thread_id`
- every conversation access must verify `user_id`
- normalize downstream errors before returning them to frontend

## Testing

Recommended test layers:

- `tests/clients/`
  - DeerFlow client behavior
- `tests/services/`
  - auth and conversation orchestration
- `tests/api/`
  - HTTP and SSE contract coverage

## Near-Term Follow-Up

The next BFF-facing product fixes should focus on consistency, not new product surface area:

1. decide which settings/resource APIs should move from same-origin Next.js bridges into BFF ownership
2. complete conversation lifecycle actions and related frontend controls
3. further reduce technical diagnostics on `/workspace/account` while keeping the session/BFF health view useful
4. align nginx and remaining local-dev route ownership with the intended BFF-first architecture
