# Frontend Chat Migration Design

## Goal

Keep the current DeerFlow frontend page structure while migrating its chat data layer away from LangGraph SDK primitives and toward a product-facing `useChat`-style integration backed by the new Gateway BFF endpoints.

## Scope

In scope:

- Preserve current routes and major page layout
- Replace direct LangGraph SDK client usage in the frontend
- Move thread list and chat send flows onto:
  - `GET /api/conversations`
  - `POST /api/chat`
  - `DELETE /api/conversations/{id}`
- Keep thread-based uploads temporarily

Out of scope:

- Rebuilding the UI
- Productizing uploads
- mem0 integration
- Renaming every `thread` symbol to `conversation`

## Current Constraints

- The frontend is heavily coupled to `@langchain/langgraph-sdk` via:
  - `core/api/api-client.ts`
  - `core/threads/hooks.ts`
  - `core/threads/types.ts`
- Page structure is already acceptable and should be preserved.
- Backend BFF endpoints now exist in `feat/python-user-isolation`:
  - `/api/conversations`
  - `/api/chat`
- Uploads still rely on `/api/threads/{thread_id}/uploads`

## Options Considered

### Option A: Keep `useStream`, point it at the Gateway

Pros:

- Lowest frontend code churn

Cons:

- Keeps frontend tightly bound to LangGraph SDK contracts
- Does not align with newer mature `useChat`-style frontend architecture

### Option B: Keep page structure, migrate hooks to `useChat`-style transport

Pros:

- Preserves UI while modernizing the data layer
- Matches current mature frontend chat patterns
- Reduces LangGraph-specific assumptions in the browser

Cons:

- Requires replacing current stream state plumbing

### Option C: Rebuild frontend state model and UI together

Pros:

- Cleanest architecture

Cons:

- Too much change for this phase

## Decision

Use Option B.

Keep the current pages and component hierarchy, but replace the frontend data layer with a `useChat`-style business API integration.

## Design

### UI Structure

Keep:

- `/workspace/chats`
- `/workspace/chats/[thread_id]`
- message list components
- input box and current layout

This avoids reworking layout and interaction design while the backend contract is changing.

### Frontend Data Model

Externally, the backend now exposes `conversation_id`.

Internally in the frontend, Phase 1 will continue to use the existing `threadId` naming in page params and component props to minimize churn.

Rule:

- `threadId` in the frontend maps to backend `conversation_id`

This is a naming compatibility layer, not a semantic commitment.

### API Layer

Replace direct LangGraph client usage with a thin fetch-based BFF client.

New responsibilities:

- fetch conversations
- create/delete conversations
- send `useChat`-style chat requests

Existing thread-based upload helpers stay in place temporarily because the backend upload API has not yet been productized.

### Hook Layer

Current hook behavior should be preserved from the component perspective:

- `useThreads()`
- `useThreadStream()`
- `useDeleteThread()`

But their internals change:

- `useThreads()` -> `GET /api/conversations`
- `useDeleteThread()` -> `DELETE /api/conversations/{id}`
- `useThreadStream()` -> `useChat`-style backend integration against `/api/chat`

The hook API should remain as stable as possible so component changes stay small.

### Streaming Model

Do not keep `useStream`.

Instead:

- use `useChat` from the `ai` package
- target the backend's AI SDK-compatible `/api/chat` contract
- adapt `useChat` state into the existing thread/message view model where needed

The first phase should prefer minimal component churn over purity, but the transport itself should be standard `useChat` rather than a bespoke SSE reader.

### Upload Strategy

Uploads stay thread-based for Phase 1:

- keep using `/api/threads/{thread_id}/uploads`
- only allow uploads when a conversation/thread already exists

This keeps upload migration out of the critical path.

### Deletion and Listing

List page:

- query conversations from `/api/conversations`
- adapt response into the existing list item shape

Delete action:

- call `/api/conversations/{id}`
- remove the item from React Query cache

### Config

The frontend should stop treating `NEXT_PUBLIC_LANGGRAPH_BASE_URL` as its main runtime dependency.

The primary frontend backend dependency becomes:

- `NEXT_PUBLIC_BACKEND_BASE_URL`

The LangGraph URL can remain temporarily only where backward compatibility still needs it.

## File-Level Direction

### Replace

- `frontend/src/core/api/api-client.ts`
- `frontend/src/core/threads/hooks.ts`

### Adapt

- `frontend/src/core/threads/types.ts`
- `frontend/src/core/config/index.ts`

### Keep mostly unchanged

- chat pages
- message list components
- input box
- thread route structure
- uploads API helper for now

## Risks

### Hook compatibility risk

Current components expect `useThreadStream()` semantics that came from LangGraph's `useStream`.

Mitigation:

- preserve the hook surface initially
- adapt BFF transport under the hook

### Upload dependency on thread id

Uploads still require a created conversation/thread before file attach can work.

Mitigation:

- keep the "new thread" creation behavior in the send flow
- only upload after a conversation id exists

### Partial migration risk

Some frontend files will still import LangGraph types during Phase 1.

Mitigation:

- prioritize removing runtime dependency first
- type cleanup can happen in a later pass

## Acceptance Criteria

- The chats list page loads from `/api/conversations`
- The chat page sends messages to `/api/chat`
- The browser no longer depends on LangGraph SDK runtime requests for list/send/delete flows
- Existing page structure and major UI behavior remain intact
- Upload flow still works for existing conversations
