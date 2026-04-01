# Frontend Protocol Boundary

## Goal

Keep the frontend aligned with mature chat-product patterns:

- frontend consumes a UI-friendly chat stream
- gateway/BFF translates runtime events
- LangGraph runtime keeps its native event model

## Recommended Boundary

```text
LangGraph runtime
  -> event: messages
  -> AIMessageChunk / metadata tuple

Gateway BFF
  -> text-start
  -> text-delta
  -> text-end
  -> finish
  -> data-conversation

Frontend
  -> useChat / AI SDK transport
```

## What Belongs Where

### Runtime protocol

These are runtime-facing details and should stay behind the Gateway:

- `event: messages`
- `AIMessageChunk`
- LangGraph node metadata
- checkpoint metadata
- tool-call internals

### Product/UI protocol

These are frontend-facing details:

- `conversation_id`
- `text-start`
- `text-delta`
- `text-end`
- `finish`
- user-facing errors

## Rules

1. Frontend should not depend on `AIMessageChunk`.
2. Frontend should not parse raw LangGraph `messages` events.
3. Gateway owns protocol translation from LangGraph stream to UI stream.
4. Internal runtime compatibility can remain LangGraph-native.
5. Business-facing APIs should stay centered on:
   - `/api/conversations`
   - `/api/chat`

## Current Status

This repository now follows the intended boundary for the main chat path:

- Gateway `/api/chat` converts runtime stream events into UI stream events.
- Frontend chat flow is built around the Gateway BFF path.
- nginx now proxies `/api/auth`, `/api/conversations`, and `/api/chat`.

## Remaining Residuals

The following code still references LangGraph-native concepts and can be cleaned up later:

- frontend still imports `Message`/`Thread` types from `@langchain/langgraph-sdk` in several files
- backend thread/runs compatibility endpoints still document `useStream`
- backend channel integrations still use LangGraph-native stream semantics
- docs still mention `messages-tuple` as a frontend-facing concept in some places

These are not blockers for the current BFF architecture, but they are the next cleanup targets if the goal is a fully product-oriented frontend contract.
