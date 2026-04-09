# BFF Development

## Current State

This service currently contains:

- a project skeleton
- a health endpoint
- service-level documentation

It does not yet implement auth, persistence, or DeerFlow proxy routes.

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

## Suggested Implementation Order

1. Add `core/config.py` for typed settings.
2. Add auth dependency plumbing in `api/deps.py`.
3. Add a DeerFlow HTTP client in `clients/deerflow.py`.
4. Define conversation schemas in `schemas/`.
5. Implement conversation service and repository boundaries.
6. Add create and list conversation routes.
7. Implement SSE proxy support for message streaming.
8. Add upload and artifact proxy routes.
9. Add tests for ownership and streaming behavior.

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
uv run pytest
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
