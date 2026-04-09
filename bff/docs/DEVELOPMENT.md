# BFF Development

## Current State

This service currently contains:

- local JWT login
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
2. Local auth with JWT and seeded demo user
3. Conversation repository and ownership service
4. DeerFlow HTTP client for thread creation and stream proxying
5. Auth, `me`, conversation create/list, and stream routes

Next planned slice:

1. upload proxy routes
2. artifact proxy routes
3. conversation deletion
4. stronger auth provider integration

## Conventions

- keep route handlers thin
- put business rules in `services/`
- isolate DeerFlow integration in `clients/`
- use BFF-owned schemas externally
- do not expose runtime `thread_id`

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
