# Contributing to the Backend

This document focuses on the Python runtime and gateway code under `backend/`.

## Development Setup

From the repository root:

```bash
make config
cd backend
uv sync
```

You need a valid root `config.yaml` before the backend can start.

## Main Ways To Run The Backend

### Standard mode

```bash
cd backend
uv run langgraph dev --no-browser --host 0.0.0.0 --port 2024
```

```bash
cd backend
PYTHONPATH=. uv run uvicorn app.gateway.app:app --host 0.0.0.0 --port 8001 --reload
```

### Full-stack local launcher

If your change touches the product path, use the repository root launcher
instead:

```bash
make dev
```

Or gateway mode:

```bash
make dev-pro
```

## Backend Structure

```text
backend/
├── app/
│   ├── gateway/           # FastAPI gateway and compatibility routes
│   └── channels/          # IM channel integrations
├── packages/harness/
│   └── deerflow/          # reusable runtime package
├── docs/
└── tests/
```

## Coding Guidelines

- keep the harness/app boundary intact
- `deerflow.*` must not import `app.*`
- keep route handlers thin
- put reusable runtime behavior in the harness layer
- add types and concise docstrings where they help

## Verification

Common commands:

```bash
cd backend
uv run pytest
uv run ruff check .
uv run ruff format --check .
```

Useful focused tests:

- `tests/test_harness_boundary.py`
- `tests/test_docker_sandbox_mode_detection.py`
- `tests/test_provisioner_kubeconfig.py`

## Documentation

If you change backend architecture, runtime behavior, commands, or config
structure, update:

- `backend/README.md`
- `backend/docs/*`
- `backend/CLAUDE.md` when developer-facing architecture notes changed
