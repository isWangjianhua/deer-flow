# BFF Development Guide

## Current Scope

The BFF currently provides:

- `local` and `oidc` auth modes
- SQLite-backed persistence
- public conversation create/list/detail/stream routes
- BFF-owned model discovery
- conversation-scoped suggestions, artifacts, and uploads
- SSE normalization for the chat path

## Local Setup

Install dependencies:

```bash
cd bff
uv sync
```

Create local env file:

```bash
cp .env.example .env
```

The BFF reads non-sensitive defaults from the repository-root `config.yaml`
under `bff:` and sensitive values from `bff/.env`.

## Preferred Full-Stack Workflow

From the repository root:

```bash
make dev-pro
```

That starts:

- gateway
- BFF
- frontend
- nginx

This is the best local path for verifying the BFF-backed chat and account flows.

## BFF-Only Workflow

If you want to work on the service in isolation:

```bash
cd bff
uv run uvicorn app.main:app --host 0.0.0.0 --port 9000 --reload
```

You also need the DeerFlow gateway running separately because the BFF proxies
runtime work to it.

## Important Conventions

- keep route handlers thin
- keep business rules in `services/`
- keep database access in `repositories/`
- keep gateway calls in `clients/deerflow.py`
- never expose runtime `thread_id` publicly

## Testing

Recommended commands:

```bash
cd bff
uv run pytest -q
uv run ruff check .
```

Coverage already exists for:

- auth providers
- ownership checks
- model routes
- streaming behavior
- conversation resources

## Where Changes Usually Require Docs Updates

Update the BFF docs whenever you change:

- public route shape
- auth behavior
- ownership rules
- stream event semantics
- startup assumptions
- frontend-facing identifiers
