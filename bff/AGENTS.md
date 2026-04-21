# AGENTS.md

Guidance for coding agents working in `bff/`.

## Service Role

This service is a lightweight FastAPI BFF.

It is the public-facing backend for the frontend and proxies requests to DeerFlow Gateway, which acts as the internal agent runtime.

The BFF owns:

- authentication boundary
- conversation ownership checks
- public API shape
- mapping between `conversation_id` and DeerFlow `thread_id`
- error normalization
- model discovery for the BFF-backed frontend path
- conversation-scoped artifact, upload, and suggestion access for the BFF-backed chat path

The BFF does not own DeerFlow internals.

## Hard Boundaries

Agents must preserve these boundaries:

- Do not expose DeerFlow `thread_id` to frontend clients.
- Do not make the frontend depend directly on DeerFlow Gateway routes or schemas.
- Do not bypass ownership checks for any conversation-scoped route.
- Do not put BFF-specific business logic into DeerFlow `backend/`.
- Do not turn this service into a transparent reverse proxy with no ownership or contract shaping.

## Public API Rules

When adding or changing endpoints:

- prefer stable BFF-owned request and response schemas
- use `conversation_id` as the external identifier
- normalize downstream DeerFlow errors
- keep auth checks and ownership checks at the BFF layer
- preserve SSE behavior for chat streaming
- preserve the current richer stream contract for reasoning, tool starts, tool progress, and
  completion

## Directory Responsibilities

- `app/api/`
  - route handlers only
  - validate request and response shapes
  - delegate logic to services
- `app/services/`
  - business rules, ownership checks, orchestration
- `app/clients/deerflow.py`
  - all DeerFlow Gateway HTTP and SSE calls
  - centralized downstream auth/context headers such as user-scoped Mem0 `X-User-Id`
- `app/repositories/`
  - database access only
- `app/models/`
  - persistence models
- `app/schemas/`
  - API and service DTOs
- `app/sse/`
  - streaming proxy helpers

Keep these responsibilities clean. Do not mix repository logic into routes or DeerFlow client code into models.

## Coding Rules

- Use FastAPI and Pydantic patterns consistently.
- Keep route handlers thin.
- Add types everywhere.
- Prefer explicit service methods over ad hoc inline logic.
- Keep DeerFlow integration isolated in one client module or package.
- Avoid hidden coupling between API handlers and database models.
- Use ASCII by default unless the file already requires Unicode.
- Add brief comments only where logic is non-obvious.

## Data and Ownership Rules

Every conversation-scoped action must verify:

1. the user is authenticated
2. the conversation belongs to that user
3. the mapped DeerFlow thread exists or is handled explicitly

Current persistence expectation:

- `users`
- `conversations`

## Streaming Rules

SSE is a first-class capability.

When editing streaming behavior:

- preserve event order
- do not buffer the full response before sending
- avoid unnecessary transformation
- only inject BFF-owned metadata when necessary
- keep DeerFlow protocol details hidden from frontend callers where possible
- do not emit duplicate reasoning or tool-progress snapshots when normalizing downstream events

## Error Handling

- Convert downstream DeerFlow transport errors into stable BFF errors.
- Do not leak internal URLs, credentials, raw stack traces, or internal IDs.
- Prefer predictable HTTP status codes and structured error payloads.

## Tests

Changes should include tests when behavior changes materially.

Priority order:

1. service-level ownership and permission tests
2. API tests for auth and conversation lifecycle
3. DeerFlow client tests for downstream integration assumptions
4. SSE proxy tests for streaming correctness

## Non-Goals

Do not introduce these without explicit approval:

- billing workflows
- payment systems
- deep subscription logic
- admin control planes
- complex async job orchestration
- frontend code inside `bff/`
- a public API that mirrors Gateway 1:1 when the BFF can provide a narrower contract

## Preferred Development Style

When adding features:

1. define the public BFF contract first
2. define service-layer behavior and ownership rules
3. isolate DeerFlow Gateway calls in the client layer
4. add or update tests
5. keep the external API independent from DeerFlow internals

Additional expectations:

- prefer narrow, ownership-aware changes over broad proxying or leakage of runtime internals
- keep auth, ownership, and contract normalization explicit in the BFF layer
- treat a completed feature as code, tests, and documentation shipped together

## Documentation and Handoff Requirements

Feature work is not complete until the affected documentation is updated.

When a change affects BFF behavior, contracts, auth, ownership, streaming, startup, or operational assumptions, update the relevant documents in the same change. This may include:

- `bff/README.md`
- `bff/AGENTS.md`
- `bff/docs/DEVELOPMENT.md`
- `bff/docs/ROADMAP.md`
- relevant root or shared `docs/` pages
- relevant roadmap documents when the change closes, adds, or reorders planned work
- `docs/superpowers/handoffs/*` when the change leaves known gaps, follow-up work, or cross-service integration context

Add a new document when the feature introduces a new contract, workflow, or operational rule that is not documented clearly elsewhere.

## If Unsure

If a change makes the frontend more dependent on DeerFlow internals, it is probably the wrong direction.

If a change weakens ownership checks or leaks internal thread identifiers, reject that direction and redesign it.
