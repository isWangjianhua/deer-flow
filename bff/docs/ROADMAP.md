# BFF Roadmap

## Purpose

This roadmap describes the recommended next development sequence for the FastAPI BFF after:

- provider-oriented auth refactor
- OIDC bearer `id_token` validation
- local and OIDC auth mode support

The goal is to move from "backend boundary is correct" to "end-to-end product flow is usable".

## Current Status

Completed on `2026-04-10`:

- `feat/frontend-oidc-login`
- `feat/frontend-bff-chat-stream`

Completed on `2026-04-11`:

- `streaming-fix`

What is now true:

- browser OIDC login is product-complete on the frontend/BFF path
- the main chat page now uses a BFF-owned conversation and stream contract
- the frontend main chat route uses `conversation_id` semantics
- the BFF now owns `create`, `list`, `detail`, and `messages/stream` for conversations
- the browser-facing BFF chat stream preserves explicit SSE anti-buffering behavior
- downstream gateway `error` events are exposed as frontend-visible `run.failed`
- post-stream history sync no longer blocks the active SSE response
- route-level BFF pytest is stable again after removing the hanging sync test path

What still remains for the next product loop:

- full "frontend only talks to BFF" consistency for model and runtime asset access
- uploads and artifact access on the BFF-backed chat path
- richer conversation lifecycle actions
- usage governance and production hardening
- browser-automation coverage for the live BFF streaming path once the local Playwright setup is dependable

## Recommended Order

### 1. Frontend / Browser OIDC Login

Status: completed

Priority: highest

Why this comes first:

- the BFF can already validate OIDC bearer `id_token`
- the missing piece is how the frontend obtains and manages that token
- without this, OIDC support is technically present but not product-complete

Recommended scope:

- browser redirect to identity provider
- callback handling
- frontend token/session handling
- attaching the token to BFF requests
- explicit logout behavior on the frontend side

Suggested branch:

- `feat/frontend-oidc-login`

## 2. Frontend Chat Stream Integration

Status: completed

Priority: highest after browser OIDC login

Why this comes next:

- the BFF already provides conversation creation and SSE streaming
- once login is usable, the next step is to make the real chat UX flow work end to end

Recommended scope:

- create conversation from frontend
- send messages through BFF
- consume SSE stream from BFF
- render incremental assistant output
- handle completion, error, and retry states

Suggested branch:

- `feat/frontend-bff-chat-stream`

## 3. Model and Runtime Boundary Cleanup

Status: next recommended branch

Priority: medium

Why this matters:

- the main chat flow already uses BFF conversation semantics
- the browser still has some direct DeerFlow Gateway dependencies
- this creates local-dev inconsistency and can surface as CORS-shaped failures when the browser
  tries to call the gateway directly

Recommended scope:

- define the intended split between BFF-owned and gateway-internal asset paths
- document `nginx` and Next.js bridge routes as the current same-origin entrypoints rather than
  treating them as incidental plumbing
- continue removing the remaining direct browser-visible DeerFlow Gateway routes after models and
  startup alignment

Suggested branch:

- `feat/bff-runtime-boundary-cleanup`

## 4. Upload and Artifact Proxy

Status: next recommended branch

Priority: medium

Why this matters:

- chat products become much more useful once users can upload files and retrieve generated outputs
- this is the next natural extension of the BFF ownership boundary

Recommended scope:

- upload route proxying
- artifact download / preview proxying
- ownership enforcement
- frontend integration for file and artifact UI
- BFF-backed attachment send flow on the main chat page
- artifact access through conversation ownership instead of raw runtime thread access
- reduction of browser-visible `/api/threads/*` dependencies

Suggested branch:

- `feat/bff-uploads-artifacts`

## 5. Conversation Lifecycle Completion

Status: next after uploads/artifacts

Priority: medium

Current gap:

- the BFF has create/list/stream, but conversation lifecycle is still incomplete

Recommended scope:

- delete conversation
- rename conversation title
- improve conversation ordering
- optional archive / soft-delete behavior
- frontend list actions and optimistic lifecycle UX
- account page cleanup so `/workspace/account` can evolve from a verification page into a
  product-facing account/settings page

Suggested branch:

- `feat/bff-conversation-lifecycle`

## 6. Usage Controls and Service Governance

Status: after practical workflow support

Priority: medium

Why this matters:

- once auth and chat are working, the next operational risk is uncontrolled usage
- this is where the BFF should start owning lightweight product governance

Recommended scope:

- rate limiting
- per-user concurrency limits
- request / audit logs
- basic usage accounting hooks

Suggested branch:

- `feat/bff-usage-guardrails`

## 7. Production Data and Ops Hardening

Status: after governance basics

Priority: lower than the end-user product loop

Why this comes later:

- SQLite is enough for local and early integration work
- product usability should be validated before heavier infra work

Recommended scope:

- PostgreSQL migration
- formal database migrations
- structured logging
- health/readiness checks
- deployment-oriented config cleanup

Suggested branch:

- `feat/bff-production-hardening`

## Suggested Milestone Grouping

### Milestone A: Usable Auth

- `feat/frontend-oidc-login`

Outcome:

- users can complete a real login flow with the chosen identity provider

Status: completed

### Milestone B: Usable Chat

- `feat/frontend-bff-chat-stream`

Outcome:

- authenticated users can start a conversation and receive streamed assistant output

Status: completed

Stability follow-through now complete:

- downstream failure propagation repaired
- browser-facing stream buffering repaired
- post-stream sync removed from the hot path
- local route-test execution stabilized

### Milestone C: Practical Workflow Support

- `feat/bff-runtime-boundary-cleanup`
- `feat/bff-uploads-artifacts`
- `feat/bff-conversation-lifecycle`

Outcome:

- users get a more consistent BFF-owned browser contract and can manage richer conversations and retrieve generated outputs

Status: current focus

### Milestone D: Service Governance

- `feat/bff-usage-guardrails`
- `feat/bff-production-hardening`

Outcome:

- the BFF is easier to operate as a real multi-user service

## Recommendation

If only one next branch should be started now, choose:

1. `feat/bff-runtime-boundary-cleanup`
2. `feat/bff-uploads-artifacts`
3. `feat/bff-conversation-lifecycle`

This sequence first removes the remaining browser/runtime boundary mismatch, then extends the now-working auth and chat baseline into a practical workflow before governance and infrastructure hardening.
