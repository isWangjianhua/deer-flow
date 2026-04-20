# Backend Documentation

This directory documents the DeerFlow backend runtime, which is split into two
layers:

- `backend/packages/harness/deerflow/`
  - the reusable harness runtime, tools, skills, sandbox, memory, and agent
    factory code
- `backend/app/`
  - the FastAPI gateway and IM-channel application layer built on top of the
    harness

## Start Here

Read these files first if you are orienting yourself in the current backend:

| Document | Purpose |
| --- | --- |
| `ARCHITECTURE.md` | Current runtime topology, harness/app split, lead-agent flow, thread model, and service boundaries |
| `API.md` | Gateway REST APIs plus the LangGraph-compatible thread and run surfaces exposed by the gateway |
| `CONFIGURATION.md` | `config.yaml`, `extensions_config.json`, and the most important runtime switches |
| `SETUP.md` | Local and Docker setup paths, standard vs gateway mode, and verification commands |

## Feature-Focused Docs

These documents stay useful when you need a subsystem-specific deep dive:

| Document | Purpose |
| --- | --- |
| `STREAMING.md` | Gateway `StreamBridge` path vs embedded `DeerFlowClient` streaming |
| `FILE_UPLOAD.md` | Upload flow, artifact paths, conversion behavior, and troubleshooting |
| `MCP_SERVER.md` | MCP server configuration and runtime behavior |
| `GUARDRAILS.md` | Guardrail middleware, providers, and policy options |
| `middleware-execution-flow.md` | Middleware ordering matrix and request flow notes |
| `summarization.md` | Context summarization behavior and configuration |
| `PATH_EXAMPLES.md` | Virtual sandbox paths and filesystem mappings |

## Historical / Design Notes

Several files in this directory are RFCs, reviews, or one-off implementation
records. They are still worth keeping, but they should not be treated as the
primary source of truth for the current architecture. Prefer the four entry
documents above when updating code or onboarding a teammate.
