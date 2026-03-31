# Chat API `useChat` Protocol Design

## Goal

Replace the current transitional business SSE chat endpoint with a frontend-facing chat API that is directly compatible with the modern `useChat` integration pattern.

The target shape is:

- `POST /api/chat`
- `GET /api/conversations`
- `POST /api/conversations`
- `GET /api/conversations/{conversation_id}`
- `DELETE /api/conversations/{conversation_id}`

The backend should remain powered by the existing LangGraph runtime and DeerFlow harness internally.

## Why This Revision Is Needed

The current Phase 1 backend added:

- conversation CRUD
- `/api/chat/stream`
- a custom business SSE contract

That was a valid transitional BFF layer, but it is not the most mature frontend integration target.

The newer mainstream approach is:

- frontend uses `useChat`
- backend exposes `/api/chat`
- backend returns AI SDK-compatible stream protocol

If the frontend is being newly built anyway, keeping a custom SSE protocol adds an unnecessary compatibility layer.

## Scope

In scope:

- redesign the chat endpoint contract
- align streaming format with AI SDK `useChat`
- keep conversation CRUD as-is
- preserve current auth and ownership boundaries
- preserve current LangGraph runtime internals

Out of scope:

- frontend code changes
- uploads redesign
- mem0 integration
- replacing LangGraph runtime

## Current State

Already implemented and still valid:

- thin auth
- thread ownership isolation
- conversation CRUD
- chat proxy helpers

What is no longer ideal:

- `POST /api/chat/stream`
- custom SSE events like:
  - `conversation.created`
  - `message.delta`
  - `message.completed`
  - `run.completed`

Those events are fine for a custom frontend transport, but they are not the best fit for direct `useChat` integration.

## Approaches Considered

### Approach A: Keep custom `/api/chat/stream` and adapt the frontend

Pros:

- no backend rework

Cons:

- frontend must carry a custom parser/adapter
- less aligned with current mainstream chat architecture

### Approach B: Keep custom business SSE but make it slightly cleaner

Pros:

- moderate backend change

Cons:

- still not truly `useChat`-native
- still leaves protocol ownership on this project

### Approach C: Make the backend chat API directly AI SDK-compatible

Pros:

- closest to current mature frontend practice
- simplest long-term frontend architecture
- removes the need for a bespoke browser-side stream protocol

Cons:

- requires reworking the current chat endpoint

## Decision

Use Approach C.

The backend should expose a chat endpoint designed for direct `useChat` consumption, while continuing to use the current internal runtime stack.

## External API Design

### Conversations

Keep:

- `GET /api/conversations`
- `POST /api/conversations`
- `GET /api/conversations/{conversation_id}`
- `DELETE /api/conversations/{conversation_id}`

### Chat

Replace:

- `POST /api/chat/stream`

With:

- `POST /api/chat`

## Request Model

The request should be shaped for `useChat`-style consumption rather than LangGraph `runs` semantics.

At minimum, the backend should accept:

- `id?`
- `messages`
- `body?`

The exact payload should be chosen to align with the AI SDK request model used by `useChat`.

Project-specific data such as `conversation_id` should travel in a stable request field rather than being encoded in a LangGraph-specific config object.

Recommended Phase 1 rule:

- use `body.conversation_id` as the external conversation selector

Behavior:

- if `conversation_id` is omitted, create a new owned conversation
- if `conversation_id` is present, validate ownership before running

## Response Model

The response should no longer be a custom business SSE contract.

Instead, it should:

- use the AI SDK data stream protocol expected by `useChat`
- include the required response header:
  - `x-vercel-ai-ui-message-stream: v1`

This lets the frontend consume the response as a standard `useChat` transport target.

## Identifier Strategy

External identifier:

- `conversation_id`

Internal runtime identifier:

- `thread_id`

Phase 1 keeps:

- `conversation_id == thread_id`

This remains the correct short-term choice because:

- ownership already persists against `chat_thread.id`
- uploads still use thread-based routes
- introducing a second mapping layer is unnecessary before the frontend migration is complete

## Backend Translation Layer

The backend still needs a translation layer, but it changes role.

Old role:

- translate LangGraph SSE into custom business SSE

New role:

- translate internal LangGraph run output into AI SDK-compatible stream frames

This should remain isolated in one place, rather than spreading stream-format concerns across the router layer.

Recommended helper ownership:

- `backend/app/gateway/chat_proxy.py`

Recommended responsibilities:

- resolve or create conversation ownership
- build chat-runtime input from frontend chat messages
- adapt LangGraph output to AI SDK stream protocol

## What Stays the Same Internally

The following should not be redesigned:

- auth/session model
- thread ownership model
- `chat_thread` persistence
- `start_run()`
- current checkpointer/store/run-manager stack
- DeerFlow sandbox and harness

This is a protocol redesign, not a runtime rewrite.

## Security Model

Unchanged:

- every conversation operation requires authentication
- every conversation must belong to the current user
- chat requests with foreign `conversation_id` must fail

The chat protocol can change without weakening those guarantees.

## Migration Strategy

### Phase 1

- keep conversation CRUD
- add or replace chat endpoint with `/api/chat`
- emit AI SDK-compatible stream protocol

### Phase 2

- migrate frontend to `useChat`
- stop using LangGraph SDK runtime client in the browser

### Phase 3

- revisit uploads and optional `conversation_id != thread_id`
- add mem0-backed user memory

## Risks

### Partial protocol mismatch

Risk:

- the backend may be only superficially similar to `useChat` while still missing protocol details

Mitigation:

- treat AI SDK compatibility as a hard requirement
- validate against the documented stream contract instead of inventing event names

### Temporary dual chat endpoints

Risk:

- both `/api/chat/stream` and `/api/chat` may coexist for a short time

Mitigation:

- mark `/api/chat/stream` transitional/internal
- migrate frontend only to `/api/chat`

### Internal LangGraph output shape drift

Risk:

- internal event shapes may change and break the adapter

Mitigation:

- keep the adapter isolated in `chat_proxy.py`
- add focused tests around protocol translation

## Acceptance Criteria

- conversation CRUD remains unchanged and passing
- chat requests go through `POST /api/chat`
- the response is consumable by `useChat`
- ownership checks still gate every conversation/chat operation
- existing LangGraph runtime internals are reused, not replaced
