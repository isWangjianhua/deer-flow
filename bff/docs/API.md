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

## Public Routes

Most routes require authentication; `POST /auth/login` and
`POST /auth/register` are the main unauthenticated exceptions.

| Route | Purpose |
| --- | --- |
| `POST /auth/login` | local login |
| `POST /auth/register` | local registration |
| `GET /me` | current user |
| `GET /models` | model list for the frontend |
| `GET /memory` | readonly lead-agent memory for the current user |
| `GET /agents` | list browser-facing agents visible to the current user |
| `GET /agents/check?name=...` | validate agent-name availability |
| `GET /agents/{agent_name}` | load one visible agent |
| `POST /agents` | create an agent through the BFF |
| `PUT /agents/{agent_name}` | update a visible agent |
| `DELETE /agents/{agent_name}` | delete a visible agent |
| `POST /agents/{agent_name}/conversations` | create a BFF conversation scoped to that agent |
| `POST /conversations` | create a main-chat conversation |
| `GET /conversations` | list visible conversations |
| `GET /conversations/{conversation_id}` | load conversation detail |
| `PATCH /conversations/{conversation_id}` | rename, pin, or unpin a conversation |
| `DELETE /conversations/{conversation_id}` | delete a conversation and its mapped DeerFlow thread |
| `POST /conversations/{conversation_id}/messages/stream` | stream chat events for an owned conversation |
| `POST /conversations/{conversation_id}/suggestions` | generate follow-up suggestions |
| `GET /conversations/{conversation_id}/artifacts/{path}` | download or preview an artifact |
| `POST /conversations/{conversation_id}/uploads` | upload a file |
| `GET /conversations/{conversation_id}/uploads` | list uploads |
| `DELETE /conversations/{conversation_id}/uploads/{filename}` | delete an uploaded file |

When a stored conversation carries `agent_name`, the BFF injects that value
into DeerFlow runtime context during streaming and also enforces that the
current user still has visibility to that agent across ownership-checked
conversation routes.

## Request / Response Rules

### Conversation creation

Response fields:

- `id`
- `title`
- `agent_name`
- `status`
- `is_pinned`
- `pinned_at`
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
