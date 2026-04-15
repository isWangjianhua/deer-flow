# CLAUDE.md

Guidance for coding agents working in `frontend/`.

## Project Overview

DeerFlow Frontend is a Next.js 16 application that now centers on a BFF-backed
workspace flow.

- Main chat and account surfaces are same-origin browser paths backed by the
  FastAPI BFF.
- Some older workspace capabilities still proxy to DeerFlow Gateway through
  Next.js route handlers.
- `http://localhost:2026` is the canonical end-to-end local entrypoint.
- `http://localhost:3000` remains useful for focused frontend work, but it is
  still a partial-bridge development path.

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start the frontend dev server with Turbopack on `:3000` |
| `pnpm dev:webpack` | Webpack fallback for Turbopack-specific regressions |
| `pnpm build` | Production build verification |
| `pnpm start` | Start an existing production build |
| `pnpm preview` | Rebuild, then start the production server |
| `pnpm check` | ESLint + TypeScript check |
| `pnpm lint` | ESLint only |
| `pnpm lint:fix` | ESLint with auto-fix |
| `pnpm typecheck` | TypeScript only |
| `pnpm test:e2e:auth` | Playwright auth regression |
| `pnpm test:e2e:chat` | Playwright chat regression |

For full-stack local work from the repo root:

```bash
make dev-pro
```

That starts `Gateway + BFF + Frontend + nginx`.

## Current Architecture

```text
browser
  -> frontend pages/components
  -> same-origin Next.js routes under /api/*
     -> /api/bff/* -> FastAPI BFF
     -> selected /api/* bridge routes -> DeerFlow Gateway
```

### Canonical browser ownership

- `/api/bff/*`
  - primary same-origin bridge to the FastAPI BFF
- `/api/mcp`, `/api/skills`, `/api/agents`
  - same-origin Next.js bridge routes that still proxy Gateway-facing APIs
- `/workspace/chats/new`
  - canonical new-chat route
- `/workspace/chat/new`
  - compatibility alias only

### Important boundaries

- Do not add new browser-visible direct calls to Gateway.
- Treat `conversation_id` as the public identifier for the BFF-backed chat
  path.
- Do not reintroduce raw runtime `thread_id` semantics into the BFF-backed UI.
- Prefer `:2026` when validating end-to-end behavior through nginx.

## Source Layout

```text
src/
├── app/
│   ├── api/                # Same-origin route handlers
│   ├── workspace/          # Workspace pages
│   └── mock/               # Mock/demo routes
├── components/
│   ├── ai-elements/        # AI UI primitives
│   ├── auth/               # Auth UI and login-required dialog
│   ├── ui/                 # Reusable UI primitives
│   └── workspace/          # Workspace-specific UI
├── core/
│   ├── auth/               # Browser auth/session + BFF helpers
│   ├── bff-chat/           # BFF chat protocol, stream parsing, state
│   ├── artifacts/          # Artifact helpers
│   ├── uploads/            # Upload helpers
│   ├── models/             # Model loading helpers
│   ├── settings/           # Same-origin settings/resource helpers
│   ├── mcp/                # Gateway-backed MCP helpers
│   ├── skills/             # Gateway-backed skill helpers
│   └── threads/            # Legacy runtime-thread semantics
├── server/
│   ├── better-auth/        # Better Auth setup
│   └── bff/                # Internal BFF base URL + auth helpers
└── styles/
```

## Current Testing Reality

Tests do exist in this package.

- Boundary tests verify route ownership, fetch targets, and module boundaries.
- `src/core/bff-chat/` has stream/state regression coverage.
- Playwright covers the main auth and BFF-backed chat flows.

When behavior changes materially, prefer tests in this order:

1. boundary tests
2. `src/core/bff-chat/` state/message tests
3. component boundary tests
4. Playwright

## Environment Notes

- `NEXT_PUBLIC_BFF_BASE_URL` defaults to same-origin `/api/bff`.
- `DEER_FLOW_INTERNAL_BFF_BASE_URL` lets Next.js server routes reach the FastAPI
  BFF directly, usually `http://127.0.0.1:9000`.
- Root launchers manage `frontend/.env.local` for
  `NEXT_PUBLIC_LANGGRAPH_BASE_URL` so gateway mode points at
  `/api/langgraph-compat`.
- `SKIP_ENV_VALIDATION=1` is still useful for some Docker/dev workflows.

## Documentation Expectations

If a change affects frontend behavior, startup assumptions, or ownership
boundaries, update the matching docs in the same change. Usually that means:

- `frontend/README.md`
- `frontend/AGENTS.md`
- relevant root README sections when launch commands or entrypoints change
