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

- authenticate against the local seeded user store and return JWT

### `GET /me`

Purpose:

- return current authenticated user metadata needed by the frontend

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

The first slice seeds a local development user:

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
