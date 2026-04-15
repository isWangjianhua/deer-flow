# BFF Docs

This directory contains service-specific documentation for the FastAPI BFF.

## Documents

- `ARCHITECTURE.md`
  - service boundary, trust model, request flow, and deployment shape
- `API.md`
  - public API surface, identifier rules, and downstream DeerFlow mapping
- `DEVELOPMENT.md`
  - local development workflow, conventions, and next implementation milestones
- `ROADMAP.md`
  - recommended next branches, development order, and milestone sequencing

## Reading Order

If you are new to this service, read the docs in this order:

1. `../README.md`
2. `ARCHITECTURE.md`
3. `API.md`
4. `DEVELOPMENT.md`
5. `ROADMAP.md`

## Key Rules

- The main auth/chat browser path should talk to the BFF.
- Some remaining browser-visible APIs are still same-origin Next.js bridge routes.
- The BFF owns authentication, ownership checks, and public API stability.
- DeerFlow Gateway stays internal and is treated as the agent runtime.
- DeerFlow `thread_id` must never be exposed to frontend callers.
