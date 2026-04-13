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

Completed on `2026-04-12` and `2026-04-13`:

- startup alignment for `make dev-pro` / `serve.sh --gateway`
- BFF model proxying
- BFF-backed artifacts, uploads, and suggestions for the main chat path
- same-origin bridge cleanup for memory, MCP, skills, and agents
- account page productization
- nginx browser-route ownership cleanup

What is now true:

- browser OIDC login is product-complete on the frontend/BFF path
- the main chat page now uses a BFF-owned conversation and stream contract
- the frontend main chat route uses `conversation_id` semantics
- the BFF now owns `create`, `list`, `detail`, and `messages/stream` for conversations
- the BFF now owns model discovery plus the main chat artifact/upload/suggestion contract
- the browser-facing BFF chat stream preserves explicit SSE anti-buffering behavior
- downstream gateway `error` events are exposed as frontend-visible `run.failed`
- post-stream history sync no longer blocks the active SSE response
- route-level BFF pytest is stable again after removing the hanging sync test path
- gateway-mode local startup launches `Gateway + BFF + Frontend + nginx`
- `/workspace/account` now works as a product-facing account/status page
- local BFF auth now supports self-service username/password registration from `/workspace/account`
- unauthenticated chat submission now opens an in-place login dialog and preserves the drafted text for explicit resend after login
- language switching remains centralized in `Settings > Appearance` rather than duplicating locale controls inside `/workspace/account`
- nginx now lets bridge-owned browser-visible API routes fall through to `frontend`

What still remains for the next product loop:

- deciding which same-origin bridge routes should become fully BFF-owned APIs
- email verification, password reset, and stronger password policy for local registration
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

Status: partially complete

Priority: medium

Why this matters:

- the main chat flow already uses BFF conversation semantics
- the browser no longer needs the raw Gateway base URL for the main chat loop, models, memory, MCP,
  skills, or agents
- some of those non-chat surfaces are still routed through same-origin Next.js bridges instead of
  BFF-owned APIs
- this phase is now mostly about deciding whether those server bridges should stay where they are or
  move into the BFF proper

Recommended scope:

- define the intended split between BFF-owned and gateway-internal asset paths
- document `nginx` and Next.js bridge routes as the current same-origin entrypoints rather than
  treating them as incidental plumbing
- continue removing or formalizing the remaining legacy runtime-thread dependencies after startup
  alignment, model proxying, same-origin settings bridges, and nginx cleanup
- define a real owner model for `memory`, `MCP`, `skills`, and `agents`
- make user-state resources cross a BFF ownership boundary before resolving internal runtime
  `thread_id` values
- remove browser-visible dependency on Gateway `/api/threads/*` for user-facing workflows
- redesign memory as user-scoped storage keyed by `user_id` instead of a single global runtime file
- keep the memory implementation replaceable so a provider such as `mem0` can be adopted later
  behind the same BFF contract

Suggested branch:

- `feat/bff-runtime-boundary-cleanup`

## 4. Upload and Artifact Proxy

Status: completed for the main BFF-backed chat path

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

Status: next product-facing gap

Priority: medium

Current gap:

- the BFF has create/list/stream, but conversation lifecycle is still incomplete
- some legacy runtime-thread workflows still rely on direct `/api/threads/*` semantics outside the
  BFF-owned chat path

Recommended scope:

- delete conversation
- rename conversation title
- improve conversation ordering
- optional archive / soft-delete behavior
- frontend list actions and optimistic lifecycle UX
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
- multi-user ownership enforcement for every user-state resource boundary

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

## 8. Account Page Productization

Status: completed

The former verification/debug page has already been converted into a product-facing account/status
page with separate browser-session and BFF-connection sections plus collapsible diagnostics.

What this now includes:

- a shared auth panel used by both `/workspace/account` and the login-required chat dialog
- local username/password registration in local auth mode
- in-place login recovery when a user tries to send a chat message while unauthenticated

What is intentionally not duplicated there:

- language switching, which remains owned by `Settings > Appearance`

## 9. Nginx Route Ownership Cleanup

Status: completed for the current same-origin bridge model

`nginx.local.conf` and `nginx.conf` now let browser-visible bridge-owned API routes fall through to
`frontend` instead of explicitly proxying `/api/models`, `/api/memory`, `/api/mcp`, `/api/skills`,
`/api/agents`, and `/api/threads/*` to Gateway.

What still remains here is architectural follow-up, not the initial cleanup:

- deciding whether additional browser-visible paths should move from Next.js bridges into BFF-owned APIs
- keeping docs aligned if Docker and local startup paths diverge again
- ensuring any remaining thread-scoped resource access is mediated by BFF ownership checks rather than
  direct browser or external use of Gateway `/api/threads/*`

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
