# Frontend BFF Chat Stream Design

## Overview

This spec defines the next frontend product slice after browser OIDC login: move the main chat experience from direct LangGraph/runtime semantics to a BFF-owned chat protocol.

The goal is not to add a temporary verification path. The goal is to switch the main chat path to the correct long-term boundary in one pass:

- `frontend` depends on `BFF`
- `BFF` owns the frontend-facing chat contract
- `gateway/agentruntime` remains an internal downstream runtime

This keeps the three layers decoupled while preserving the current chat UI style and streaming experience.

## Goals

- Replace the main frontend chat path with a BFF-owned conversation and stream contract.
- Remove frontend dependence on runtime `thread_id` semantics in the primary chat flow.
- Keep the existing workspace chat UI as much as possible instead of rebuilding the interface.
- Support the minimum usable end-to-end loop:
  - create conversation
  - navigate to chat by `conversation_id`
  - send user message
  - receive streamed assistant output
  - show tool execution progress in collapsible UI blocks
  - handle completion, error, and retry states

## Non-Goals

- Upload and artifact UI integration
- Conversation rename/delete/archive
- Full legacy LangGraph path removal in the first implementation step
- Exposing raw gateway/agentruntime events to the frontend
- Exposing raw tool payloads or internal runtime identifiers to the frontend

## Recommended Direction

Use a BFF-owned chat protocol with a frontend boundary at `frontend/src/core/bff-chat/`.

That boundary should own:

- conversation creation and list retrieval
- stream request construction
- stream event parsing
- frontend chat state updates derived from BFF events

The frontend should not keep direct knowledge of runtime `thread_id`, LangGraph stream event shapes, or downstream tool execution protocol.

The BFF should act as an anti-corruption layer between frontend chat semantics and internal gateway/agentruntime semantics.

## Architecture

```text
Browser
  -> workspace chat UI
    -> core/bff-chat
      -> BFF conversation APIs
      -> BFF stream events
        -> gateway/agentruntime (internal)
```

Required boundaries:

1. `frontend` only knows `conversation_id`
2. `BFF` translates downstream runtime behavior into a stable frontend protocol
3. `gateway/agentruntime` owns actual tool orchestration and runtime execution

## Routing And Identifier Model

The main chat route should move from runtime-oriented `thread_id` semantics to BFF-oriented `conversation_id` semantics.

Recommended route:

- `/workspace/chats/[conversation_id]`

This is a deliberate contract correction, not just a cosmetic rename. The frontend should stop implying that its URL identifier is the runtime thread identifier.

The BFF continues to own:

- public `conversation_id`
- internal `deerflow_thread_id`

The frontend must never receive or persist the internal runtime identifier.

## Frontend Module Design

### `frontend/src/core/bff-chat/`

This new module becomes the chat boundary for the frontend.

It should expose:

- `createConversation()`
- `listConversations()`
- `streamMessage()`
- event parsing helpers
- chat-state mapping helpers

This module should be the only place where BFF chat routes and event protocol details are known.

### `frontend/src/core/threads/`

This area should evolve from a runtime-thread abstraction into a frontend chat-state layer.

Responsibilities after migration:

- local chat state
- optimistic user message insertion
- assistant placeholder lifecycle
- conversation-oriented selectors and helpers

This layer should stop assuming direct runtime thread semantics for the main path.

### `frontend/src/app/workspace/chats/[conversation_id]/`

The route page should stay thin:

- load route params
- initialize chat state
- mount existing workspace chat UI

The page should not own BFF protocol details directly.

## UI Reuse Strategy

The implementation should preserve the current visual language wherever possible.

Reuse-first targets:

- message list and grouping
- markdown rendering
- input box
- streaming indicator
- workspace layout and navigation shell

The main change is the data source and event model, not the visual design.

## Tool Presentation Model

Tool calls are not the final response. Tool calls are part of the process that leads to an assistant response.

Terminology:

- `event`: one stream item in transport
- `tool`: a tool execution unit in the assistant workflow
- `message`: a user-facing chat message, especially the final assistant output

The final answer should normally be represented as a completed `assistant message`.

Tool execution should be shown as collapsible process blocks inside the assistant message container.

Recommended frontend-visible tool lifecycle:

- `tool.started`
- `tool.progress`
- `tool.completed`
- `tool.failed`

Recommended message lifecycle:

- `message.started`
- `message.delta`
- `message.completed`

These are frontend product events. They are not required to mirror downstream runtime event names one-to-one.

## BFF Event Contract

The BFF should normalize downstream stream behavior into a stable frontend event protocol.

Recommended minimum event set:

- `conversation.created`
- `message.started`
- `message.delta`
- `message.completed`
- `tool.started`
- `tool.progress`
- `tool.completed`
- `tool.failed`
- `run.failed`

Design rule:

- the frontend must not parse gateway/agentruntime-native event formats
- the BFF must emit stable product-facing events even if downstream runtime formats evolve

## Request And Stream Flow

### Conversation creation

1. frontend starts a new chat
2. frontend calls `POST /conversations`
3. BFF creates and stores conversation mapping
4. frontend navigates to `/workspace/chats/[conversation_id]`

### Message send

1. frontend submits a user message
2. frontend inserts the user message optimistically
3. frontend inserts an assistant placeholder
4. frontend calls `POST /conversations/{conversation_id}/messages/stream`
5. BFF validates auth and ownership
6. BFF opens downstream runtime stream
7. BFF emits normalized frontend events
8. frontend updates the assistant placeholder and tool blocks incrementally

### Stream completion

1. frontend receives `message.completed`
2. assistant placeholder becomes final assistant message
3. tool blocks become stable history items associated with the assistant message

## Error Handling

The BFF should normalize downstream failures into stable public errors.

Recommended error codes:

- `unauthenticated`
- `forbidden`
- `conversation_not_found`
- `stream_failed`
- `downstream_unavailable`

Frontend handling rules:

- failed send keeps the user message visible
- assistant placeholder becomes error state or is replaced with retry affordance
- retry should reissue the stream request without inventing a new frontend protocol

The frontend must not surface downstream stack traces or private transport details.

## Tool Visibility Rules

The frontend should show tool progress summaries, not raw runtime protocol payloads.

Visible:

- tool name or category
- coarse progress text
- completion / failure state

Not visible by default:

- raw tool arguments
- internal runtime metadata
- internal identifiers
- gateway error stack traces

This keeps the UI useful without coupling it to runtime internals.

## Migration Strategy

This slice is intended to switch the main chat path, not to build a parallel temporary chat UI.

Implementation should therefore:

1. introduce the BFF chat boundary
2. adapt existing chat state/hooks to conversation-oriented semantics
3. switch the main workspace chat route to `conversation_id`
4. preserve existing UI components wherever possible

Legacy LangGraph-specific main-path logic may remain in the repository briefly during migration, but should stop owning the primary route behavior.

## Testing Strategy

### Frontend

- unit tests for BFF chat client helpers
- unit tests for stream event parsing
- unit tests for chat state transitions driven by normalized BFF events
- one browser-level E2E for create -> send -> stream -> complete

### BFF

- route tests for conversation creation
- route tests for message stream endpoint
- event normalization tests from downstream SSE to frontend product events
- auth and ownership tests for stream requests

### Contract Coverage

- frontend-to-BFF contract tests for public chat event expectations
- BFF-to-runtime contract tests for downstream stream assumptions

The purpose of contract testing here is to keep `frontend`, `BFF`, and `gateway/agentruntime` independently evolvable.

## Future Path

Once this slice is complete, follow-on work can extend the same boundary with:

1. upload and artifact support
2. conversation lifecycle actions
3. richer tool detail views
4. broader compatibility cleanup for legacy runtime-thread terminology

## Implementation Guidance

Keep the first implementation focused on the main chat loop and protocol correctness.

That means:

- change the primary route to `conversation_id`
- reuse existing UI instead of redesigning the workspace
- build the chat boundary at `core/bff-chat`
- let the BFF own product-facing stream semantics
- keep runtime tool orchestration inside gateway/agentruntime

The most important success criterion is that the frontend no longer depends on runtime-native chat semantics in the primary path.
