# Post Chat Development Plan

## Objective

Turn the now-working auth + BFF chat baseline into a practical product workflow, then harden it for multi-user operation.

Completed baseline:

- `feat/frontend-oidc-login`
- `feat/frontend-bff-chat-stream`

## Recommended Next Branch Order

1. `feat/bff-uploads-artifacts`
2. `feat/bff-conversation-lifecycle`
3. `feat/bff-usage-guardrails`
4. `feat/bff-production-hardening`

## Milestone 1: Upload And Artifact Proxy

### Goal

Make the BFF-backed chat path useful for file-assisted workflows.

### Scope

- add BFF upload proxy routes
- add BFF artifact download / preview proxy routes
- enforce conversation ownership for uploads and artifacts
- map frontend attachment send flow onto the BFF path
- adapt artifact panel access so the main chat page no longer depends on raw runtime thread routes

### Exit Criteria

- users can upload files from the main BFF-backed chat page
- downstream generated artifacts can be viewed or downloaded through the BFF
- the artifact panel works on the BFF-backed chat path
- browser and API tests cover upload and artifact ownership

### Risks

- artifact URLs and upload metadata are still thread-oriented in parts of the frontend
- the existing artifact panel assumes runtime thread identifiers

## Milestone 2: Conversation Lifecycle Completion

### Goal

Finish the product-facing conversation management layer now that create/list/detail/stream are in place.

### Scope

- rename conversation title
- delete conversation
- improve list ordering and empty states
- optional archive or soft-delete behavior
- update frontend list actions and optimistic state handling

### Exit Criteria

- conversation titles can be updated from the frontend
- conversations can be deleted safely with ownership enforcement
- the chat list reflects rename and delete without requiring manual refresh
- API tests and UI regressions cover the main lifecycle actions

## Milestone 3: Usage Guardrails

### Goal

Add lightweight governance before the service grows into a noisier multi-user environment.

### Scope

- per-user request rate limiting
- per-user streaming concurrency limits
- audit-friendly request logging around conversation actions
- basic usage metering hooks

### Exit Criteria

- abusive or accidental burst usage is constrained at the BFF
- logs make it possible to trace conversation actions by user and conversation
- overload behavior is explicit and returns stable BFF error codes

## Milestone 4: Production Hardening

### Goal

Reduce operational risk after the product loop is feature-complete enough to justify heavier infra work.

### Scope

- PostgreSQL migration
- formal DB migrations
- health and readiness endpoints
- structured logging cleanup
- deployment-oriented config validation

### Exit Criteria

- the BFF can run against PostgreSQL with repeatable migrations
- health/readiness checks are usable by deployment systems
- logs and config are production-oriented instead of local-dev oriented

## Suggested Immediate Execution Plan

### Branch 1

Start `feat/bff-uploads-artifacts`.

First tasks:

- inventory current frontend upload and artifact dependencies on runtime `threadId`
- define BFF upload and artifact route contract
- add BFF API tests for upload ownership and artifact access
- switch the main BFF-backed chat page to those routes

### Branch 2

After uploads/artifacts stabilize, start `feat/bff-conversation-lifecycle`.

First tasks:

- add BFF rename and delete APIs
- add frontend chat list actions
- add optimistic UI and rollback behavior

## Recommendation

Do not start governance or production-hardening work before uploads/artifacts and lifecycle are complete.

The current highest-value gap is no longer authentication or basic chat. It is practical workflow support on top of the BFF-backed main chat path.
