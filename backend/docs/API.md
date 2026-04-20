# Backend API Reference

The backend exposes three HTTP surfaces that are easy to confuse if you only
look at ports:

1. **LangGraph native API**
   - standard mode only
   - proxied by nginx under `/api/langgraph/*`
2. **Gateway REST + compatibility API**
   - always available on the gateway service
   - proxied by nginx under `/api/*`
3. **BFF API**
   - owned by the separate `/bff` service, not by the backend package
   - mentioned here only because it is the main product-facing consumer of the
     gateway compatibility routes

## Standard vs Gateway Mode

In standard mode:

- `/api/langgraph/*` goes to the dedicated LangGraph server
- `/api/*` goes to the FastAPI gateway

In gateway mode:

- there is no dedicated LangGraph server
- frontend callers are pointed at `/api/langgraph-compat/*`
- the gateway exposes LangGraph-compatible thread and run routes itself

## Gateway REST Endpoints

These routes live in `backend/app/gateway/routers/`.

| Route | Purpose |
| --- | --- |
| `GET /health` | health check |
| `GET /api/models` | list configured models |
| `GET /api/models/{name}` | get one model |
| `GET /api/mcp/config` | read MCP server config |
| `PUT /api/mcp/config` | update MCP server config |
| `GET /api/skills` | list enabled skills |
| `GET /api/skills/{name}` | get one skill |
| `PUT /api/skills/{name}` | enable or disable a skill |
| `POST /api/skills/install` | install a skill archive |
| `GET /api/skills/custom/*` | custom-skill CRUD and history |
| `GET /api/memory/*` | compatibility memory routes |
| `POST /api/threads/{thread_id}/uploads` | upload files into a thread |
| `GET /api/threads/{thread_id}/uploads/list` | list uploaded files |
| `DELETE /api/threads/{thread_id}/uploads/{filename}` | delete one uploaded file |
| `GET /api/threads/{thread_id}/artifacts/{path}` | serve an artifact |
| `POST /api/threads/{thread_id}/suggestions` | generate follow-up suggestions |
| `GET /api/channels` | inspect IM channel status |
| `POST /api/channels/{name}/restart` | restart an IM channel |
| `GET /api/agents/*` | custom-agent and user-profile APIs when `agents_api.enabled=true` |

Notes:

- active web content returned from the artifact route is forced to download
  rather than render inline
- uploads may auto-convert PDF, Office, and spreadsheet files into Markdown
- the memory routes are runtime/backward-compatibility surfaces, not the main
  user-facing memory product boundary

## Gateway Thread Endpoints

These routes are implemented by `backend/app/gateway/routers/threads.py`.

They provide a LangGraph-compatible thread model backed by the gateway store
and checkpointer.

| Route | Purpose |
| --- | --- |
| `POST /api/threads` | create or idempotently return a thread |
| `POST /api/threads/search` | search thread records in the gateway store |
| `GET /api/threads/{thread_id}` | fetch one thread record |
| `PATCH /api/threads/{thread_id}` | merge metadata onto a thread |
| `DELETE /api/threads/{thread_id}` | delete thread-local filesystem data and best-effort store/checkpointer state |
| `GET /api/threads/{thread_id}/state` | fetch current serialized state |
| `POST /api/threads/{thread_id}/state` | merge channel values back into state |
| `POST /api/threads/{thread_id}/history` | fetch checkpoint history |

Important detail:

- BFF conversation creation uses `POST /api/threads`
- BFF conversation detail sync uses thread history/state, not the public
  frontend identifier

## Gateway Run Endpoints

These routes are implemented by:

- `backend/app/gateway/routers/thread_runs.py`
- `backend/app/gateway/routers/runs.py`
- `backend/app/gateway/routers/assistants_compat.py`

### Thread-bound runs

| Route | Purpose |
| --- | --- |
| `POST /api/threads/{thread_id}/runs` | create a background run |
| `POST /api/threads/{thread_id}/runs/stream` | create a run and stream SSE |
| `POST /api/threads/{thread_id}/runs/wait` | create a run and wait for final state |
| `GET /api/threads/{thread_id}/runs` | list runs for a thread |
| `GET /api/threads/{thread_id}/runs/{run_id}` | inspect one run |
| `POST /api/threads/{thread_id}/runs/{run_id}/cancel` | cancel a run |
| `GET /api/threads/{thread_id}/runs/{run_id}/join` | join an existing stream |
| `GET|POST /api/threads/{thread_id}/runs/{run_id}/stream` | join or cancel-then-stream an existing run |

### Stateless runs

| Route | Purpose |
| --- | --- |
| `POST /api/runs/stream` | stream a run without pre-creating a thread |
| `POST /api/runs/wait` | run synchronously without pre-creating a thread |

If the request supplies `config.configurable.thread_id`, the stateless routes
reuse it. Otherwise the gateway generates a temporary thread id.

### Assistant compatibility

| Route | Purpose |
| --- | --- |
| `GET /api/assistants` | list the default assistant |
| `POST /api/assistants/search` | list default + configured custom assistants |
| `GET /api/assistants/{assistant_id}` | inspect one assistant |
| `GET /api/assistants/{assistant_id}/graph` | compatibility graph metadata |
| `GET /api/assistants/{assistant_id}/schemas` | compatibility schema metadata |

The compatibility layer still routes all assistants through `lead_agent`.
Custom assistants are resolved by injecting `configurable.agent_name`.

## Gateway Run Request Shape

The compatibility run routes accept a superset of LangGraph-style fields:

- `assistant_id`
- `input`
- `config`
- `metadata`
- `stream_mode`
- `interrupt_before`
- `interrupt_after`
- `multitask_strategy`
- DeerFlow-specific `context`

Supported `context` keys that are forwarded into `configurable` include:

- `user_id`
- `model_name`
- `thinking_enabled`
- `reasoning_effort`
- `is_plan_mode`
- `subagent_enabled`
- `max_concurrent_subagents`

The gateway also normalizes `recursion_limit` to `100` unless the caller
overrides it explicitly.

## SSE Semantics

Gateway streaming uses `StreamBridge` and exposes LangGraph-compatible SSE
frames.

Important behavior:

- `Content-Location` points at the canonical run resource so SDK helpers can
  recover `run_id`
- `X-Accel-Buffering: no` is set to avoid nginx buffering
- `Last-Event-ID` replay is supported by the stream bridge
- disconnect handling is controlled by `on_disconnect=cancel|continue`

## Relationship To The BFF

The BFF does not expose raw backend threads publicly.

Instead it:

1. creates a backend thread through `POST /api/threads`
2. stores `conversation_id -> deerflow_thread_id`
3. streams through `POST /api/threads/{thread_id}/runs/stream`
4. normalizes SSE events for the frontend

That is why the gateway thread and run APIs should be treated as runtime-facing
contracts even though they are HTTP endpoints.
