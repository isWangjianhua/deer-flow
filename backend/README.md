# DeerFlow Backend

# Install backend, BFF, and frontend dependencies from the repo root
make install

The backend is the runtime foundation behind DeerFlow. It provides the
agent/harness package, the FastAPI gateway, LangGraph-compatible HTTP routes,
IM-channel integrations, and the filesystem/sandbox/memory subsystems that let
the agent do real work.

## What Lives Here

There are two layers inside `backend/`:

- `packages/harness/deerflow/`
  - reusable runtime package
  - lead-agent factory, middleware, sandbox, tools, skills, memory, tracing,
    subagents, and the embedded `DeerFlowClient`
- `app/`
  - FastAPI gateway and IM channels

The harness is reusable. The gateway app is the repository-specific HTTP
surface built on top of it.

## Service Topology

The backend participates in two local startup modes:

### Standard mode

```text
Browser -> nginx :2026
  -> frontend :3000
  -> /api/bff/* -> frontend same-origin bridge -> BFF :9000
  -> /api/langgraph/* -> LangGraph :2024
  -> other /api/* -> Gateway :8001
```

### Gateway mode

```text
Browser -> nginx :2026
  -> frontend :3000
  -> /api/bff/* -> frontend same-origin bridge -> BFF :9000
  -> /api/langgraph-compat/* -> Gateway :8001
  -> other /api/* -> Gateway :8001
```

Gateway mode is the lighter local stack because the gateway hosts the runtime
itself and the dedicated LangGraph process is skipped.

## Core Runtime Pieces

### Lead Agent

`make_lead_agent(config)` is the default graph entry point.

It resolves:

- the effective model and reasoning settings
- the tool set
- the skill-aware system prompt
- the middleware chain
- optional custom-agent identity via `configurable.agent_name`

### Middleware Chain

The current lead-agent chain is assembled dynamically rather than being a fixed
count. The important order is:

1. thread data
2. uploads
3. sandbox
4. dangling tool-call repair
5. model-error normalization
6. optional guardrails
7. sandbox audit
8. tool-error normalization
9. optional summarization
10. optional plan-mode todos
11. optional token usage
12. title generation
13. memory queueing
14. optional Mem0 injection
15. optional image injection
16. optional deferred tool filtering
17. optional subagent limit enforcement
18. loop detection
19. clarification interception

### Tools

The runtime can combine:

- config-defined tools from `config.yaml`
- built-in tools such as `present_file`, `ask_clarification`, `view_image`,
  and `task`
- MCP tools from `extensions_config.json`
- ACP agent tools when configured

### Sandbox

Each thread gets an isolated workspace rooted at:

`backend/.deer-flow/threads/{thread_id}/user-data/`

The agent works through virtual paths such as `/mnt/user-data/workspace` and
`/mnt/skills`.

### Memory

Supported providers:

- `file`
- `mem0`

Mem0 mode is user-scoped and request-time injected, which is how the current
BFF-backed chat flow passes authenticated runtime memory into the agent.
The compatibility memory routes under `/api/memory` now follow the same rule:
when `memory.provider=mem0`, callers must provide `X-User-Id`, and embedded
`DeerFlowClient` memory-management helpers must be given `user_id=...`.

## Gateway Responsibilities

The FastAPI gateway owns:

- model discovery
- MCP config
- skills management
- compatibility memory routes
- uploads and artifacts
- suggestions
- thread CRUD/state/history
- run lifecycle and SSE streaming
- optional custom-agent APIs
- IM-channel status endpoints

See `docs/API.md` for the route-level map.

## Quick Start

From the repository root:

```bash
make config
make install
make dev
```

Or gateway mode:

```bash
make dev-pro
```

For backend-only work:

```bash
cd backend
uv sync
PYTHONPATH=. uv run uvicorn app.gateway.app:app --host 0.0.0.0 --port 8001 --reload
```

## Directory Map

```text
backend/
├── app/
│   ├── gateway/
│   └── channels/
├── packages/harness/
│   └── deerflow/
├── docs/
├── tests/
├── pyproject.toml
└── README.md
```

## Read Next

- `docs/ARCHITECTURE.md`
- `docs/API.md`
- `docs/CONFIGURATION.md`
- `docs/SETUP.md`
