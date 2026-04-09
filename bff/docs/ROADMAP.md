# BFF Roadmap

## Purpose

This roadmap describes the recommended next development sequence for the FastAPI BFF after:

- provider-oriented auth refactor
- OIDC bearer `id_token` validation
- local and OIDC auth mode support

The goal is to move from "backend boundary is correct" to "end-to-end product flow is usable".

## Recommended Order

### 1. Frontend / Browser OIDC Login

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

## 3. Upload and Artifact Proxy

Priority: medium

Why this matters:

- chat products become much more useful once users can upload files and retrieve generated outputs
- this is the next natural extension of the BFF ownership boundary

Recommended scope:

- upload route proxying
- artifact download / preview proxying
- ownership enforcement
- frontend integration for file and artifact UI

Suggested branch:

- `feat/bff-uploads-artifacts`

## 4. Conversation Lifecycle Completion

Priority: medium

Current gap:

- the BFF has create/list/stream, but conversation lifecycle is still incomplete

Recommended scope:

- delete conversation
- rename conversation title
- improve conversation ordering
- optional archive / soft-delete behavior

Suggested branch:

- `feat/bff-conversation-lifecycle`

## 5. Usage Controls and Service Governance

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

## 6. Production Data and Ops Hardening

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

### Milestone B: Usable Chat

- `feat/frontend-bff-chat-stream`

Outcome:

- authenticated users can start a conversation and receive streamed assistant output

### Milestone C: Practical Workflow Support

- `feat/bff-uploads-artifacts`
- `feat/bff-conversation-lifecycle`

Outcome:

- users can manage richer conversations and retrieve generated outputs

### Milestone D: Service Governance

- `feat/bff-usage-guardrails`
- `feat/bff-production-hardening`

Outcome:

- the BFF is easier to operate as a real multi-user service

## Recommendation

If only one next branch should be started now, choose:

1. `feat/frontend-oidc-login`
2. `feat/frontend-bff-chat-stream`

This sequence turns the current backend foundation into an actual usable product path without prematurely spending effort on heavier infrastructure.
