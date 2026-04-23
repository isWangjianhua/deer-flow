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

Use these files as the current source of truth:

1. `../README.md`
2. `ARCHITECTURE.md`
3. `API.md`
4. `CONFIGURATION.md`
5. `SETUP.md`

`API.md` covers both thread-based runs and stateless runs, including
`/api/runs/stream` and `/api/runs/wait`.

Historical RFCs and implementation notes in this directory are still useful
context, but they should not override the five entry documents above when the
repository code has moved on.

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
primary source of truth for the current architecture. Prefer the five entry
documents above when updating code or onboarding a teammate.
