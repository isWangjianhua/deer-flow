# BFF API Reference

The BFF exposes a product-facing API for the frontend. The point of this API is
not to mirror the DeerFlow gateway. Its purpose is to expose a narrower
contract that is stable for the browser and ownership-aware by default.

## Public Identifiers

Allowed in public APIs:

- `conversation_id`

Not allowed in public APIs:

- `thread_id`
- `deerflow_thread_id`
- raw gateway route fragments

## Implemented Routes

### Auth

| Route | Purpose |
| --- | --- |
| `POST /auth/login` | local username/password login |
| `POST /auth/register` | local username/password self-registration |
| `GET /me` | current authenticated user |

Notes:

- `POST /auth/login` is only the active login path in `local` mode
- in `oidc` mode, protected requests accept bearer `id_token` credentials and
  `/me` still returns the mapped local BFF user record

### Conversations

| Route | Purpose |
| --- | --- |
| `POST /conversations` | create a conversation and downstream thread mapping |
| `GET /conversations` | list conversations for the current user |
| `GET /conversations/{conversation_id}` | fetch conversation detail plus runtime-derived values |
| `PATCH /conversations/{conversation_id}` | rename, pin, or unpin a conversation after ownership validation |
| `DELETE /conversations/{conversation_id}` | hard-delete a conversation and its mapped DeerFlow thread |
| `POST /conversations/{conversation_id}/messages/stream` | stream assistant output over SSE |

Current conversation detail values include:

- `title`
- `messages`
- `artifacts`
- `todos`

### Conversation resources

| Route | Purpose |
| --- | --- |
| `POST /conversations/{conversation_id}/suggestions` | generate follow-up suggestions |
| `GET /conversations/{conversation_id}/artifacts/{path}` | download or preview artifacts |
| `POST /conversations/{conversation_id}/uploads` | upload files into the mapped runtime thread |
| `GET /conversations/{conversation_id}/uploads` | list uploaded files |
| `DELETE /conversations/{conversation_id}/uploads/{filename}` | delete one uploaded file |

### Models

| Route | Purpose |
| --- | --- |
| `GET /models` | list models visible to the product path |

## Request / Response Rules

### Conversation creation

Response fields:

- `id`
- `title`
- `status`
- `created_at`

### Message streaming

The stream request accepts:

- `message`
- optional `model_name`
- optional `thinking_enabled`
- optional `reasoning_effort`
- optional `is_plan_mode`
- optional `subagent_enabled`

The BFF forwards those values as runtime context to the DeerFlow gateway after
ownership validation.

### Error shape

The BFF uses a stable error envelope:

```json
{
  "detail": {
    "code": "conversation_not_found",
    "message": "Conversation not found"
  }
}
```

Rules:

- do not leak raw gateway URLs
- do not leak internal thread identifiers
- do not leak stack traces

## SSE Contract

The BFF forwards a normalized event stream to the frontend. Common events are:

- `message.started`
- `message.delta`
- `reasoning.delta`
- `message.completed`
- `tool.started`
- `tool.progress`
- `tool.completed`
- `tool.failed`
- `run.failed`

The contract is intentionally richer than a plain final-message stream because
the chat UI needs reasoning and tool progress updates.

## Downstream Mapping

Internally, the BFF talks to the DeerFlow gateway for:

- thread creation
- message streaming
- thread history
- suggestions
- artifact access
- uploads

Those downstream routes are implementation details. The browser should treat
the BFF as the API boundary and nothing more.
