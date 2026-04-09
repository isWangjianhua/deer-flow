# BFF Architecture

## Purpose

The BFF is the public-facing backend service between the frontend and DeerFlow Gateway.

It exists to keep frontend contracts stable while isolating DeerFlow-specific runtime details behind a service boundary.

## System Boundary

```text
Frontend
  -> BFF (FastAPI)
    -> Authentication
    -> Ownership checks
    -> Rate limit and audit hooks
    -> DeerFlow Gateway (internal runtime)
```

The frontend should never call DeerFlow Gateway directly.

## Responsibilities

### BFF owns

- frontend-facing API design
- authentication and user identity lookup
- conversation ownership checks
- `conversation_id -> deerflow_thread_id` mapping
- SSE streaming proxy behavior
- downstream error normalization
- audit logging hooks
- basic rate limiting hooks

### DeerFlow Gateway owns

- agent execution
- tool execution
- thread runtime behavior
- file upload handling for thread-scoped runtime state
- artifact generation and retrieval

## Trust Model

The BFF is the trust boundary for end-user requests.

Rules:

- end users authenticate to the BFF
- the BFF validates whether a user can access a conversation
- the BFF is the only service allowed to know the downstream `thread_id`
- DeerFlow Gateway should be reachable only from internal network paths

## Identifier Model

External identifier:

- `conversation_id`

Internal runtime identifier:

- `deerflow_thread_id`

The mapping is owned by the BFF persistence layer. This prevents frontend coupling to DeerFlow runtime internals and leaves room for future runtime replacement.

## Request Flows

### Conversation creation

1. frontend sends create request to BFF
2. BFF authenticates user
3. BFF creates a DeerFlow thread when needed
4. BFF stores a mapping record
5. BFF returns a BFF-owned `conversation_id`

### Message streaming

1. frontend sends stream request using `conversation_id`
2. BFF validates user ownership
3. BFF loads the mapped DeerFlow thread
4. BFF opens downstream stream to DeerFlow Gateway
5. BFF forwards SSE events without buffering the full response
6. BFF records audit metadata

### Uploads and artifacts

1. frontend sends request to BFF
2. BFF validates ownership
3. BFF maps conversation to DeerFlow thread
4. BFF proxies request to DeerFlow Gateway
5. BFF returns normalized result

## Deployment Model

Recommended deployment shape:

```text
Public Internet
  -> frontend
  -> BFF
  -> private DeerFlow Gateway
```

Recommended network rules:

- expose BFF publicly
- keep DeerFlow Gateway on private network only
- do not embed DeerFlow credentials in frontend clients

## First-Version Non-Goals

The first version should not include:

- billing
- payment systems
- complex subscription orchestration
- admin back office
- deep cross-service workflow orchestration

## Evolution Path

The current architecture is intentionally thin.

It should evolve in this order:

1. stable auth and ownership boundary
2. stable conversation lifecycle APIs
3. stable SSE proxy behavior
4. upload and artifact proxy support
5. rate limiting, audit enrichment, and quota checks
