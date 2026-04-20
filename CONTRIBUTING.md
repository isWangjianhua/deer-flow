# Contributing to DeerFlow

This repository is a full-stack project with five main moving parts in local
development:

- LangGraph server
- Gateway
- BFF
- Frontend
- nginx

Docker is the easiest path for a consistent environment, but local development
is also supported.

## Recommended Development Paths

### Docker development

Prerequisites:

- Docker Desktop or Docker Engine
- optional: `pnpm` if you want to share the host cache for faster rebuilds

Setup:

```bash
make config
make docker-init
make docker-start
```

Gateway mode:

```bash
make docker-start-pro
```

Access:

- app: `http://localhost:2026`

Notes:

- `make docker-start` starts `provisioner` only when the configured sandbox
  mode requires it
- if Docker commands fail on Linux with daemon permission errors, add your user
  to the `docker` group and re-login before retrying

### Local development

Prerequisites:

```bash
make check
```

Required tools:

- Node.js 22+
- pnpm
- uv
- nginx

Setup:

```bash
make config
make install
make dev
```

Gateway mode:

```bash
make dev-pro
```

Access:

- app: `http://localhost:2026`

## Canonical Local Entry Point

Prefer validating the full product path through:

- `http://localhost:2026`

Why:

- it includes nginx routing
- it exercises the frontend same-origin bridge routes
- it includes the BFF boundary used by the main auth and chat flows

`http://localhost:3000` is still useful for focused frontend work, but it is
not the canonical end-to-end environment.

## Manual Service Control

If you need to run services separately, these are the important commands:

### Standard mode

```bash
cd backend
uv run langgraph dev --no-browser --host 0.0.0.0 --port 2024
```

```bash
cd backend
PYTHONPATH=. uv run uvicorn app.gateway.app:app --host 0.0.0.0 --port 8001 --reload
```

```bash
cd bff
uv run uvicorn app.main:app --host 0.0.0.0 --port 9000 --reload
```

```bash
cd frontend
pnpm dev
```

```bash
nginx -g 'daemon off;' -c "$(pwd)/docker/nginx/nginx.local.conf" -p "$(pwd)"
```

### Gateway mode

Skip the LangGraph process and run:

- gateway
- BFF
- frontend
- nginx

In practice, the root `make dev-pro` launcher is usually simpler and less
error-prone.

## Project Structure

```text
deer-flow/
├── backend/
│   ├── app/                   # FastAPI gateway and IM channels
│   ├── packages/harness/      # deerflow runtime package
│   ├── docs/
│   └── tests/
├── bff/                       # FastAPI BFF
├── frontend/                  # Next.js app
├── docker/
├── scripts/
├── skills/
└── docs/
```

## Testing

Common checks:

```bash
cd backend
uv run pytest
```

```bash
cd bff
uv run pytest
```

```bash
cd frontend
pnpm check
```

Useful focused checks:

- backend harness/app boundary:
  - `backend/tests/test_harness_boundary.py`
- BFF auth and conversation flow:
  - `bff/tests/api/test_auth_routes.py`
  - `bff/tests/api/test_conversation_routes.py`
- frontend BFF chat boundary:
  - `frontend/src/core/bff-chat/*.test.ts`
- frontend end-to-end:
  - `frontend/tests/e2e/auth.spec.ts`
  - `frontend/tests/e2e/chat.spec.ts`

## Branching and Sync

This fork keeps:

- `main` as the upstream mirror
- `master` as the downstream working branch

Feature branches should branch from `master` and open PRs back into `master`.

See `docs/FORK_SYNC_WORKFLOW.md` for the full sync procedure.

## Contribution Workflow

1. update from `master`
2. create a feature branch
3. make the change
4. run the smallest relevant verification set
5. update affected docs
6. open a PR back into `master`

## Documentation Rule

If your change affects architecture, startup commands, runtime ownership, auth,
API behavior, or user workflow, update the matching docs in the same change.
