# Backend Setup Guide

This guide is for developers working on the backend runtime and gateway.

## Recommended Entry Points

From the repository root:

```bash
make config
make install
make dev
```

That starts the full local stack in standard mode:

- LangGraph server
- Gateway
- BFF
- Frontend
- nginx

If you want the gateway to host the runtime itself:

```bash
make dev-pro
```

## Minimal Backend-Only Setup

If you only need the Python services:

```bash
cd backend
uv sync
```

You still need a root-level `config.yaml`.

Generate it from the repository root if missing:

```bash
make config
```

## Config Files

Required:

- repository-root `config.yaml`

Usually also present:

- repository-root `extensions_config.json`
- root `.env` for model keys and runtime secrets
- `bff/.env` if you are running the BFF

## Local Standard Mode

Start services individually if you are isolating the runtime:

```bash
cd backend
uv run langgraph dev --no-browser --host 0.0.0.0 --port 2024
```

In another shell:

```bash
cd backend
PYTHONPATH=. uv run uvicorn app.gateway.app:app --host 0.0.0.0 --port 8001 --reload
```

If you need the full product path, start the BFF and frontend through the root
launcher instead of reproducing the entire stack by hand.

## Local Gateway Mode

Gateway mode skips the dedicated LangGraph process and exposes the runtime
through gateway compatibility endpoints.

```bash
make dev-pro
```

This is the easiest way to test the BFF-backed chat flow end to end.

## Docker Development

If you prefer Docker:

```bash
make docker-init
make docker-start
```

Or gateway mode:

```bash
make docker-start-pro
```

## Verification

Useful checks after setup:

```bash
curl http://localhost:8001/health
curl http://localhost:2026
```

If you are validating the product path, prefer the nginx entrypoint:

- `http://localhost:2026`

That path includes the frontend, same-origin bridge routes, BFF, and gateway
ownership model that the product actually uses.

## Common Issues

### `config.yaml` not found

Run:

```bash
make config
```

Or set `DEER_FLOW_CONFIG_PATH`.

### Docker permission errors

If Docker-backed sandbox commands fail with daemon permission errors on Linux,
see the Docker note in the repository-level `CONTRIBUTING.md`.

### Qdrant not running in Mem0 mode

If `memory.provider=mem0` and the vector store provider is Qdrant, the startup
scripts attempt to prepare Qdrant automatically. Check:

```bash
scripts/ensure-qdrant.sh --mode=dev --print-required
```

### Frontend works on `:3000` but not on `:2026`

That usually indicates nginx routing or a missing BFF/gateway process. Use the
root `make dev` or `make dev-pro` launchers when validating full-stack changes.
