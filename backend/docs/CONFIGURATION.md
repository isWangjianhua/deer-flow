# Backend Configuration Guide

The backend reads two configuration files from the repository root by default:

- `config.yaml`
  - main runtime configuration
- `extensions_config.json`
  - MCP server definitions and per-skill enabled state

## Config Resolution

`AppConfig.resolve_config_path()` checks these locations in order:

1. explicit `config_path`
2. `DEER_FLOW_CONFIG_PATH`
3. `backend/config.yaml`
4. repository-root `config.yaml`

`extensions_config.json` follows the same pattern through
`DEER_FLOW_EXTENSIONS_CONFIG_PATH`.

## Versioning and Upgrades

`config.example.yaml` currently carries `config_version: 7`.

When your local `config.yaml` is older, startup emits a warning. Use:

```bash
make config-upgrade
```

That merges newly introduced fields into your local config and keeps a backup.

## High-Value Sections In `config.yaml`

The file is large, but most day-to-day backend work falls into a few groups.

| Section | Why it matters |
| --- | --- |
| `lead_agent` | display name for the default lead-agent prompt |
| `bff` | defaults consumed by the separate FastAPI BFF service |
| `models` | runtime model catalog, provider wiring, reasoning and vision capabilities |
| `tool_groups` / `tools` | which tool entry points the agent can load |
| `tool_search` | deferred loading for MCP tools |
| `uploads` | upload conversion and file handling behavior |
| `sandbox` | local vs AIO sandbox provider and provisioner settings |
| `skills` | skill discovery path and container path |
| `title` | auto-title generation |
| `summarization` | context summarization |
| `memory` | file memory vs Mem0 retrieval and write-back |
| `skill_evolution` | agent-managed writes under `skills/custom` |
| `checkpointer` | persistence for the embedded `DeerFlowClient` |
| `channels` | IM-channel integration defaults |
| `guardrails` | pre-tool-call authorization |
| `token_usage` | token tracking middleware |

## Models

Each model entry defines both provider wiring and runtime capability flags.

Commonly used fields:

- `name`
- `display_name`
- `use`
- `model`
- `api_key`
- `base_url`
- `supports_thinking`
- `supports_reasoning_effort`
- `supports_vision`
- `use_responses_api`
- `output_version`

Two practical notes:

- OpenAI-compatible gateways still use `langchain_openai:ChatOpenAI` with a
  `base_url`
- CLI-backed providers such as Codex CLI and Claude Code rely on local auth
  files instead of request-time API keys

## Tooling and Skills

`tools` controls config-defined tools such as:

- web search and fetch
- file read and write
- `str_replace`
- `bash`

`extensions_config.json` controls:

- MCP servers under `mcpServers`
- enabled or disabled skill state under `skills`

When `tool_search.enabled=true`, MCP tools are deferred and discovered through
the `tool_search` built-in tool instead of being injected into the prompt
upfront.

## Sandbox

The main choices are:

- `deerflow.sandbox.local:LocalSandboxProvider`
- `deerflow.community.aio_sandbox:AioSandboxProvider`

Useful related settings:

- `allow_host_bash`
- `image`
- `provisioner_url`
- `idle_timeout`
- `mounts`
- output limits such as `bash_output_max_chars`

If you enable Mem0 with Qdrant, the startup scripts may also bootstrap a local
Qdrant container automatically.

## Memory

Two supported providers:

- `file`
- `mem0`

Important Mem0-related fields:

- `mem0_config`
- `mem0_search_limit`
- `profile_limit`
- `query_window_turns`
- `profile_budget_ratio`
- `debounce_seconds`
- `mem0_write_token_budget`

In this fork, Mem0 retrieval is request-scoped and keyed by authenticated
`user_id` when the BFF forwards one in the chat context.

## Checkpointer and Stream Bridge

The embedded `DeerFlowClient` can persist conversation state with:

- `checkpointer.type=memory`
- `checkpointer.type=sqlite`
- `checkpointer.type=postgres`

The gateway-mode runtime can also be configured with a stream bridge backend
and queue limits through the `stream_bridge` section when needed.

## BFF and Frontend-Adjoining Settings

The backend config now also carries cross-service defaults for the BFF:

- `bff.env`
- `bff.host`
- `bff.port`
- `bff.auth.*`
- `bff.deerflow.*`

Sensitive BFF values such as `DATABASE_URL` and `BFF_SECRET_KEY` stay in
`bff/.env`.

The frontend still has its own environment variables in `frontend/.env`, but
the canonical local stack manages some runtime overrides automatically through
`scripts/serve.sh`.

## Safe Workflow

Recommended habit when changing config:

1. edit `config.example.yaml` first
2. bump `config_version` if the schema changed
3. update the matching docs
4. run `make config-upgrade`
5. restart or reload the affected services only if the changed subsystem
   requires it
