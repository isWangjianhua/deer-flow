# BFF API

## API Design Goals

The BFF exposes a frontend-facing API that is independent from DeerFlow Gateway internals.

Goals:

- keep the external API stable
- hide DeerFlow runtime identifiers
- centralize auth and ownership checks
- preserve streaming behavior for chat UX

## Public Resource Model

Primary frontend resource:

- `conversation`

The frontend should work with BFF-owned identifiers and schemas only.

## Identifier Rules

Allowed in public APIs:

- `conversation_id`

Not allowed in public APIs:

- `thread_id`
- `deerflow_thread_id`
- raw DeerFlow route fragments

## Implemented Endpoints

### `POST /auth/login`

Purpose:

- authenticate through the local auth provider and return JWT

Notes:

- this route is the `local` provider login path
- when `BFF_AUTH_PROVIDER=oidc`, this route is not the active login path and should not be used for OIDC login flows
- the provider layer is internal, so external providers are not part of the public login contract

### `GET /me`

Purpose:

- return current authenticated user metadata needed by the frontend

Notes:

- the handler resolves the request through provider identity mapping
- in `local` mode, the JWT resolves to the seeded or local BFF user
- in `oidc` mode, protected requests accept an external bearer `id_token`, but `/me` still returns the mapped local BFF user record

### `POST /conversations`

Purpose:

- create a new BFF conversation and downstream DeerFlow thread mapping

Response shape should include:

- `id`
- `title`
- `status`
- `created_at`

### `GET /conversations`

Purpose:

- list current user's conversations

### `POST /conversations/{conversation_id}/messages/stream`

Purpose:

- stream assistant responses over SSE

Rules:

- validate ownership before opening downstream stream
- keep event order intact
- do not expose DeerFlow thread identifiers

Auth notes:

- in `oidc` mode, this protected route accepts an external bearer `id_token`
- the BFF validates the token, maps the identity to a local BFF user, and then applies the same ownership rules as `local` mode

## Deferred Endpoints

### `POST /conversations/{conversation_id}/uploads`

Purpose:

- proxy user uploads to the mapped DeerFlow thread

### `GET /conversations/{conversation_id}/artifacts/{path}`

Purpose:

- proxy artifact download or preview from the mapped DeerFlow thread

### `DELETE /conversations/{conversation_id}`

Purpose:

- delete BFF-owned conversation state and invoke downstream cleanup when needed

## Error Contract

The BFF should return stable errors even when DeerFlow returns transport-specific failures.

Current first-slice error response shape:

```json
{
  "detail": {
    "code": "conversation_not_found",
    "message": "Conversation not found"
  }
}
```

Rules:

- do not leak downstream URLs
- do not leak internal thread identifiers
- do not return raw stack traces

## Local Auth Bootstrap

The first slice seeds a local development user that is used by the default `local` provider:

- username: `demo`
- password: `demo123`

## Downstream Mapping Rules

The BFF may call DeerFlow Gateway internally, but those details are not part of the public contract.

Examples:

- BFF `conversation_id` maps internally to DeerFlow `thread_id`
- BFF stream route may map to DeerFlow streaming APIs
- BFF upload route may map to DeerFlow thread upload APIs

The frontend should not rely on any of those mappings.

## SSE Rules

SSE is a required part of the first version.

Implementation rules:

- send incremental events as they arrive
- do not wait for full completion before responding
- inject BFF metadata only if needed
- keep frontend parsing rules stable even if DeerFlow internals change

## Versioning Guidance

When API behavior changes:

- prefer additive changes first
- keep response field names BFF-owned
- avoid reflecting DeerFlow naming directly into frontend contracts
