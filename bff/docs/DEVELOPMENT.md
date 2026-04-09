# BFF Development

## Current State

This service currently contains:

- provider-oriented auth with `local` and `oidc` auth modes
- SQLite persistence
- conversation create and list routes
- SSE message streaming proxy to DeerFlow Gateway
- test coverage for auth, conversation ownership, and streaming

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

### Start the BFF

```bash
cd bff
uv run uvicorn app.main:app --host 0.0.0.0 --port 9000 --reload
```

### Start DeerFlow Gateway

From the repository root:

```bash
make dev-pro
```

## Implementation Status

Completed in the first slice:

1. Typed settings and SQLite session wiring
2. `user_identities` table plus identity mapping for auth providers
3. Local auth with JWT and seeded demo user
4. Conversation repository and ownership service
5. DeerFlow HTTP client for thread creation and stream proxying
6. Auth provider abstraction layer, `me`, conversation create/list, and stream routes

Next planned slice:

1. upload proxy routes
2. artifact proxy routes
3. conversation deletion
4. browser and frontend OIDC redirect/callback integration

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

When `BFF_AUTH_PROVIDER=oidc`, configure all of the following:

- `BFF_OIDC_ISSUER`
- `BFF_OIDC_AUDIENCE`
- `BFF_OIDC_JWKS_URL`

This slice only validates the incoming `id_token`. Browser redirect, authorization-code exchange, and callback handling are intentionally out of scope for now.

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
