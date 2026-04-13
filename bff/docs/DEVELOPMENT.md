# BFF Development

## Current State

This service currently contains:

- provider-oriented auth with `local` and `oidc` auth modes
- SQLite persistence
- conversation create, list, detail, and stream routes
- BFF-owned model discovery
- conversation-scoped artifact, upload, and suggestion routes
- SSE message streaming proxy to DeerFlow Gateway
- test coverage for auth, conversation ownership, streaming, models, and conversation resources

## Local Development

### Install dependencies

```bash
cd bff
uv sync
```

### Configure environment

```bash
cp .env.example .env
```

### Start the full local stack

From the repository root:

```bash
make dev-pro
```

This starts `Gateway + BFF + Frontend + nginx`.

### Start the BFF only

```bash
cd bff
uv run uvicorn app.main:app --host 0.0.0.0 --port 9000 --reload
```

### Start DeerFlow Gateway

If you are running the BFF on its own, start Gateway separately:

```bash
cd backend
PYTHONPATH=. uv run uvicorn app.gateway.app:app --host 0.0.0.0 --port 8001 --reload
```

## Implementation Status

Completed in the first slice:

1. Typed settings and SQLite session wiring
2. `user_identities` table plus identity mapping for auth providers
3. Local auth with JWT and seeded demo user
4. Conversation repository and ownership service
5. DeerFlow HTTP client for thread creation and stream proxying
6. Auth provider abstraction layer, `me`, conversation create/list, and stream routes

Current next slice:

1. conversation lifecycle completion such as delete and rename
2. deciding whether memory, MCP, skills, and agents should become BFF-owned APIs or remain stable same-origin bridges
3. turning memory into user-scoped storage keyed by `user_id` instead of a single global runtime file
4. defining explicit owner models for `MCP`, `skills`, and `agents`
5. removing browser-visible dependency on Gateway `/api/threads/*` for user-facing resource access
6. keeping the memory provider swappable so a future backend such as `mem0` can sit behind the same
   BFF contract
7. additional operational hardening around config loading, uploads, and large artifact handling

## Conventions

- keep route handlers thin
- put business rules in `services/`
- isolate DeerFlow integration in `clients/`
- use BFF-owned schemas externally
- do not expose runtime `thread_id`

## Auth Mode Configuration

`BFF_AUTH_PROVIDER` selects the active auth mode:

- `local` uses the seeded demo user and BFF-issued JWTs
- `oidc` validates external bearer `id_token` credentials and maps them to local BFF users

When `BFF_AUTH_PROVIDER=local`, the BFF now exposes both:

- `POST /auth/login` for existing local users
- `POST /auth/register` for self-service username/password registration

Current registration scope is intentionally narrow:

- username/password only
- no email collection or verification
- no forgot-password or password-reset flow

When `BFF_AUTH_PROVIDER=oidc`, configure all of the following:

- `BFF_OIDC_ISSUER`
- `BFF_OIDC_AUDIENCE`
- `BFF_OIDC_JWKS_URL`

The BFF still validates the incoming `id_token`. Browser redirect, authorization-code exchange, and callback handling are owned by the frontend auth layer rather than by the BFF itself.

## Testing Guidance

Recommended commands:

```bash
cd bff
uv run pytest -q
uv run ruff check .
```

As features are added, prioritize tests in this order:

1. service ownership logic
2. API route behavior
3. DeerFlow client behavior
4. SSE proxy behavior

## Documentation Maintenance

Update docs when one of these changes:

- public API contract
- conversation lifecycle rules
- auth boundary
- downstream DeerFlow integration model
- deployment assumptions
