# Backend Architecture

This document describes the backend as it exists in this fork today. The short
version is:

- the **harness** lives under `backend/packages/harness/deerflow/`
- the **gateway app** and **IM channels** live under `backend/app/`
- the frontend-facing product path now also includes a separate **FastAPI BFF**
  service in `/bff`, even though that code is outside this directory

## Runtime Topology

In the canonical local stack (`make dev`):

```text
Browser
  -> nginx :2026
    -> frontend :3000
    -> /api/bff/* -> frontend same-origin bridge -> BFF :9000
    -> /api/langgraph/* -> LangGraph server :2024
    -> other /api/* -> Gateway :8001
```

In gateway mode (`make dev-pro`), the dedicated LangGraph server is skipped and
the gateway exposes a LangGraph-compatible runtime surface itself:

```text
Browser
  -> nginx :2026
    -> frontend :3000
    -> /api/bff/* -> frontend same-origin bridge -> BFF :9000
    -> /api/langgraph-compat/* -> Gateway :8001 (embedded runtime)
    -> other /api/* -> Gateway :8001
```

## Harness / App Split

The backend has a strict dependency direction:

- `deerflow.*` in `backend/packages/harness/deerflow/`
  - reusable runtime package
  - agents, middlewares, models, sandbox, skills, MCP, memory, tracing,
    checkpointer helpers, and the embedded `DeerFlowClient`
- `app.*` in `backend/app/`
  - FastAPI gateway
  - LangGraph-compatible HTTP endpoints
  - IM channel integrations

The important rule is:

- `app.*` may import `deerflow.*`
- `deerflow.*` must not import `app.*`

`backend/tests/test_harness_boundary.py` enforces that rule in CI.

## Lead-Agent Lifecycle

The default runtime entry point is
`backend/packages/harness/deerflow/agents/lead_agent/agent.py:make_lead_agent`.

At run creation time the system resolves:

1. the effective model
2. runtime flags such as `thinking_enabled`, `reasoning_effort`,
   `is_plan_mode`, and `subagent_enabled`
3. the effective agent identity
   - `lead_agent` remains the single graph
   - custom agents are routed by passing `configurable.agent_name`
4. the tool set
5. the system prompt
6. the middleware chain

### Middleware Order

The lead-agent middleware chain is assembled dynamically. The order matters more
than the exact count because several entries are conditional.

Current order:

1. `ThreadDataMiddleware`
2. `UploadsMiddleware`
3. `SandboxMiddleware`
4. `DanglingToolCallMiddleware`
5. `LLMErrorHandlingMiddleware`
6. `GuardrailMiddleware` when `guardrails.enabled=true`
7. `SandboxAuditMiddleware`
8. `ToolErrorHandlingMiddleware`
9. `DeerFlowSummarizationMiddleware` when enabled
10. `TodoMiddleware` when `is_plan_mode=true`
11. `TokenUsageMiddleware` when `token_usage.enabled=true`
12. `TitleMiddleware`
13. `MemoryMiddleware`
14. `Mem0InjectionMiddleware` when `memory.provider=mem0`
15. `ViewImageMiddleware` when the resolved model supports vision
16. `DeferredToolFilterMiddleware` when `tool_search.enabled=true`
17. `SubagentLimitMiddleware` when `subagent_enabled=true`
18. `LoopDetectionMiddleware`
19. `ClarificationMiddleware`

That order is spread across:

- `backend/packages/harness/deerflow/agents/middlewares/tool_error_handling_middleware.py`
- `backend/packages/harness/deerflow/agents/lead_agent/agent.py`

## Tool and Capability Model

The lead agent can combine four tool sources:

- tools configured in `config.yaml`
- built-in DeerFlow tools such as `present_file`, `ask_clarification`,
  `view_image`, and `task`
- MCP tools loaded from `extensions_config.json`
- ACP agent tools when `acp_agents` are configured

Important runtime behaviors:

- host `bash` is hidden automatically when the local sandbox forbids host shell
  execution
- `view_image` is exposed only when the resolved model supports vision
- MCP tools can be deferred behind `tool_search` to reduce prompt bloat
- subagent delegation exposes the `task` tool only when the run enables it

## Sandbox and Filesystem Model

The sandbox layer gives each thread its own working area under
`backend/.deer-flow/threads/{thread_id}/user-data/`.

Virtual paths seen by the agent:

| Virtual path | Backing path |
| --- | --- |
| `/mnt/user-data/workspace` | `backend/.deer-flow/threads/{thread_id}/user-data/workspace` |
| `/mnt/user-data/uploads` | `backend/.deer-flow/threads/{thread_id}/user-data/uploads` |
| `/mnt/user-data/outputs` | `backend/.deer-flow/threads/{thread_id}/user-data/outputs` |
| `/mnt/skills` | repository `skills/` directory |

Supported sandbox providers:

- `LocalSandboxProvider`
  - simplest local development path
  - host `bash` remains disabled by default
- `AioSandboxProvider`
  - container-backed sandbox execution
  - can run directly against Docker or via the provisioner service for
    Kubernetes-backed sandboxes

## Memory Model

DeerFlow currently supports two runtime memory modes:

- `memory.provider=file`
  - JSON-backed compatibility memory in `memory.json`
- `memory.provider=mem0`
  - user-scoped runtime memory with retrieval and write-back
  - request-time injection via `Mem0InjectionMiddleware`
  - optional Qdrant preflight handled by `scripts/ensure-qdrant.sh`

Key point: in Mem0 mode, memory is not baked permanently into the cached system
prompt. It is retrieved per request and injected at model-call time.

## Gateway Responsibilities

The FastAPI gateway is defined in `backend/app/gateway/app.py`.

It owns:

- model discovery
- MCP configuration
- skills management
- compatibility memory routes
- artifact serving
- uploads
- thread CRUD and cleanup
- suggestions
- optional custom-agent HTTP management
- IM-channel status/restart routes
- LangGraph-compatible thread and run endpoints

The gateway is also the runtime host in gateway mode.

## Gateway Run Surfaces

Gateway currently exposes two compatible run surfaces.
This is the primary run-entry summary; see `API.md` for full run lifecycle
routes (including cancel, join, and existing-run stream).

### Thread-based runs

- `POST /api/threads/{thread_id}/runs`
- `POST /api/threads/{thread_id}/runs/stream`
- `POST /api/threads/{thread_id}/runs/wait`
- `GET /api/threads/{thread_id}/runs`
- `GET /api/threads/{thread_id}/runs/{run_id}`

### Stateless runs

- `POST /api/runs/stream`
- `POST /api/runs/wait`

These stateless runs are client-facing convenience entry points.

The stateless routes are "stateless" only from the browser/client point of
view. Internally they still resolve a `thread_id`: they reuse
`config.configurable.thread_id` when present, or generate a new thread
automatically when it is absent.

## LangGraph-Compatible Surfaces

The project now exposes two compatible runtime surfaces:

- **standard mode**
  - native LangGraph server under `/api/langgraph/*`
- **gateway mode and internal callers**
  - gateway-owned compatibility routes under `/api/threads/*`,
    `/api/runs/*`, and `/api/assistants/*`

This compatibility layer is what the BFF uses for conversation creation,
streaming, and history lookup.

## Thread and Conversation Boundaries

The backend runtime still reasons in terms of `thread_id`.

The product path does not expose that identifier directly to end users:

- the BFF maps public `conversation_id` values to internal `thread_id`
- the frontend main chat path uses `conversation_id`
- gateway thread routes remain internal/runtime-oriented APIs

This split is intentional and is one of the main architecture boundaries in the
current fork.

## Key Directories

```text
backend/
├── app/
│   ├── gateway/        # FastAPI gateway and LangGraph-compatible HTTP routes
│   └── channels/       # Feishu / Slack / Telegram / WeCom integrations
├── packages/harness/
│   └── deerflow/
│       ├── agents/
│       ├── config/
│       ├── community/
│       ├── mcp/
│       ├── models/
│       ├── runtime/
│       ├── sandbox/
│       ├── skills/
│       ├── subagents/
│       ├── tools/
│       └── client.py
├── docs/
└── tests/
```

## When To Read Other Docs

- read `API.md` for route-level details
- read `CONFIGURATION.md` for `config.yaml` and `extensions_config.json`
- read `STREAMING.md` for the difference between gateway streaming and the
  embedded client path
- read `middleware-execution-flow.md` if you need a request-by-request
  middleware matrix
