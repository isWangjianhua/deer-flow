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

## Auth Modes

The BFF currently supports two authentication modes:

- `local`
  - uses seeded or locally managed users
  - issues BFF-owned JWTs through `POST /auth/login`
- `oidc`
  - accepts an external bearer `id_token`
  - validates the token against configured issuer, audience, and JWKS settings
  - maps the external identity into a local BFF user before request handling continues

Browser redirect and callback-based OIDC login flows are not part of the current slice.

## Responsibilities

### BFF owns

- frontend-facing API design
- authentication and user identity lookup
- external identity to local user mapping
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
- in `oidc` mode, bearer `id_token` values are validated by the BFF
- all downstream authorization decisions are made against the mapped local BFF user
- the BFF validates whether a user can access a conversation
- the BFF is the only service allowed to know the downstream `thread_id`
- DeerFlow Gateway should be reachable only from internal network paths

## Identifier Model

External identifier:

- `conversation_id`

Internal runtime identifier:

- `deerflow_thread_id`

The mapping is owned by the BFF persistence layer. This prevents frontend coupling to DeerFlow runtime internals and leaves room for future runtime replacement.

Authentication identity mapping:

- external OIDC identity is keyed by `provider + subject`
- the BFF stores that mapping in `user_identities`
- conversation ownership continues to use the stable local `users.id`

That last rule matters: even in `oidc` mode, the BFF does not use the raw bearer token as an ownership key.

## Request Flows

### Conversation creation

1. frontend sends create request to BFF
2. BFF authenticates user
3. if needed, BFF resolves external identity into a local BFF user
4. BFF creates a DeerFlow thread when needed
5. BFF stores a mapping record using the stable local `user_id`
6. BFF returns a BFF-owned `conversation_id`

### Message streaming

1. frontend sends stream request using `conversation_id`
2. BFF authenticates the request
3. if needed, BFF resolves external identity into a local BFF user
4. BFF validates user ownership
5. BFF loads the mapped DeerFlow thread
6. BFF opens downstream stream to DeerFlow Gateway
7. BFF forwards SSE events without buffering the full response
8. BFF records audit metadata

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
- do not expose JWKS, issuer secrets, or downstream runtime details through the frontend

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
