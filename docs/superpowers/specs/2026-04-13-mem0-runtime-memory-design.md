# Mem0 Runtime Memory Design

Date: 2026-04-13

## Summary

Replace DeerFlow's runtime long-term memory implementation with `Mem0 OSS` via the Python SDK.

This slice includes:

- runtime memory retrieval and persistence moving from local `memory.json` storage to `Mem0 OSS`
- user-scoped long-term memory keyed by `user_id`
- request-time memory injection instead of static prompt-time memory loading
- browser-facing `/api/memory` and related settings UI being removed from the product surface

This slice intentionally does not include:

- migrating existing `memory.json` data into Mem0
- a new browser memory management UI
- storing memory in BFF
- agent-scoped memory isolation

## Problem

The current memory implementation is not suitable for authenticated multi-user product flows:

- long-term memory is stored in a local runtime file rather than a user-scoped memory system
- browser memory APIs still proxy directly to Gateway instead of flowing through the intended BFF boundary
- memory is loaded into the system prompt when the agent is created, which makes per-request `user_id` scoping awkward
- the existing product surface suggests editable browser memory management, but the next desired architecture is runtime-owned memory rather than frontend-managed memory

The current design is acceptable for a single-user local runtime, but it is the wrong shape for multi-user authenticated chat.

## Goals

- Replace runtime long-term memory storage with `Mem0 OSS` using the Python SDK.
- Scope long-term memory by `user_id`.
- Share long-term memory across all agents for the same authenticated user.
- Resolve memory at request time instead of caching a static memory block in the agent prompt.
- Keep BFF as the browser-facing auth and ownership boundary.
- Remove the current browser-facing memory management surface (`/api/memory` and Settings > Memory).
- Preserve graceful degradation when memory is unavailable.

## Non-Goals

- Do not introduce `agent_name` as a memory isolation key.
- Do not build a new BFF-owned memory CRUD API in this slice.
- Do not keep the current browser memory settings page as a deprecated-but-functional path.
- Do not migrate old `memory.json` content into Mem0 automatically.
- Do not change unrelated BFF conversation ownership behavior.
- Do not turn Mem0 into a separate REST hop from DeerFlow runtime in this slice.

## Current Context

Relevant current implementation details:

- `backend/packages/harness/deerflow/agents/memory/storage.py` persists memory as a local file-backed structure
- `backend/packages/harness/deerflow/agents/memory/updater.py` uses an LLM to update a structured `memory.json` payload
- `backend/packages/harness/deerflow/agents/lead_agent/prompt.py` injects memory during prompt template generation
- `backend/packages/harness/deerflow/agents/middlewares/memory_middleware.py` only knows about `thread_id` and `agent_name`
- `backend/packages/harness/deerflow/client.py` caches the system prompt when the agent is created
- `bff/app/api/routes/conversations.py` streams chat requests but does not currently pass `user_id` into downstream runtime context
- `frontend/src/app/api/memory/*` and `frontend/src/components/workspace/settings/memory-settings-page.tsx` still expose the old memory product surface

The most important constraint is that static prompt-time memory injection conflicts with user-scoped request-time memory.

## Chosen Approach

Use `Mem0 OSS` through the Python SDK inside `deerflow-harness`, and move long-term memory from a static prompt-time concern to a request-time runtime concern.

The design has four core decisions:

1. `Mem0 OSS Python SDK` is the memory backend.
2. `user_id` is the only long-term memory scope.
3. `MemoryMiddleware` becomes responsible for both request-time memory injection and post-run memory persistence.
4. The browser-facing `/api/memory` surface is removed rather than reimplemented on top of Mem0 in this slice.

This keeps memory in the runtime where it belongs, keeps BFF limited to identity and ownership concerns, and avoids turning memory into a BFF-local data store.

## Alternatives Considered

### Option 1: `Mem0 OSS` Python SDK inside `deerflow-harness`

Pros:

- aligns with Mem0's Python-first OSS integration path
- fits the existing Python runtime architecture
- avoids another network hop from runtime to an internal REST service
- keeps memory logic close to prompt injection and post-run updates

Cons:

- adds a new runtime dependency to the harness package
- still requires refactoring static prompt memory injection

### Option 2: `Mem0 OSS` via REST API from DeerFlow runtime

Pros:

- clear service boundary
- language-agnostic internal memory API

Cons:

- larger implementation and operational surface
- adds HTTP client, retries, and service health management inside runtime
- not needed for this repository's current Python-only runtime integration

### Option 3: Keep file-backed runtime memory and only add `user_id` namespacing

Pros:

- smallest immediate code change

Cons:

- keeps the wrong long-term storage model
- does not adopt the desired memory backend
- retains structured-file assumptions that do not match the intended future direction

Option 1 is the chosen approach.

## Architecture

```text
Browser
  -> Frontend
    -> BFF
      -> authenticated user_id in stream context
        -> Gateway / runtime
          -> Mem0 OSS Python SDK
```

Responsibilities:

- Frontend: no direct memory product surface in this slice
- BFF: authenticate the user and pass `user_id` downstream
- Gateway/runtime: request-time memory retrieval and post-run memory persistence
- Mem0 OSS: durable long-term memory backend

The BFF owns the boundary. The runtime owns memory behavior. Mem0 owns storage and retrieval.

## Runtime Design

### Memory storage adapter

`backend/packages/harness/deerflow/agents/memory/storage.py` should stop treating a local JSON file as the primary storage abstraction.

Instead it should provide a Mem0-backed adapter responsible for:

- initializing the Mem0 SDK client from runtime config
- reading memories by `user_id`
- writing new memories by `user_id`
- deleting or clearing memories only where still needed by internal tests or compatibility helpers

`agent_name` may still be included as metadata on a stored memory item, but it must not be used as the scope key.

### Memory update flow

`backend/packages/harness/deerflow/agents/memory/updater.py` should keep the useful parts of the current updater:

- conversation filtering
- correction and reinforcement detection
- LLM-based extraction of durable facts/preferences/context

But its output model should change.

Instead of generating and saving a full structured `memory.json`, it should:

- derive a set of memory items worth persisting
- normalize and deduplicate those items
- write them to Mem0 under the current `user_id`

The updater remains the place where "what should become long-term memory" is decided.

### Request-time memory injection

`backend/packages/harness/deerflow/agents/middlewares/memory_middleware.py` should become the request-scoped memory orchestrator.

Before model execution it should:

- read `user_id` from runtime context
- skip injection if `user_id` is missing
- fetch relevant memory from Mem0
- format the retrieved memories into a compact `<memory>` block
- inject that block into the current run instead of relying on a statically cached prompt

After agent execution it should:

- keep the current queue-based debounce behavior
- pass `user_id` through the queue context
- trigger Mem0-backed updates through `updater.py`

### Prompt template changes

`backend/packages/harness/deerflow/agents/lead_agent/prompt.py` should stop loading durable memory directly from storage during `apply_prompt_template()`.

The prompt template should remain responsible for static instruction text, skills context, and other stable system prompt material.

Long-term memory should no longer be baked into the cached prompt at agent creation time.

This is the key change that makes user-scoped runtime memory correct.

### Agent/runtime entrypoints

`backend/packages/harness/deerflow/agents/lead_agent/agent.py` and `backend/packages/harness/deerflow/client.py` need supporting changes so that cached agent construction no longer assumes memory is part of the immutable system prompt.

The agent should still be cached for stable configuration, but memory itself must be resolved per request.

## Identity and Scope

### Scope model

The long-term memory scope is:

- `user_id`

It is explicitly not:

- `thread_id`
- `agent_name`
- `conversation_id`

Consequences:

- the same user sees shared long-term memory across all agents
- different users are isolated
- memory is not tied to a single conversation thread

### Missing `user_id`

If a runtime entrypoint does not provide `user_id`, the runtime should degrade safely:

- do not inject long-term memory
- do not persist new long-term memory

This avoids accidentally falling back to a global shared memory scope.

## BFF and Gateway Integration

### BFF stream context

`bff/app/api/routes/conversations.py` must include the authenticated `user_id` in the downstream chat context sent to DeerFlow Gateway.

This is the minimum BFF change required for browser chat to participate in user-scoped memory.

### Gateway compatibility

Gateway already supports passing request `context` into runtime configuration. This slice should reuse that path rather than inventing a new memory-specific transport mechanism.

### Non-browser entrypoints

Any runtime entrypoint that already has a trusted `user_id` may opt into the same memory model.

If a path does not have a trustworthy `user_id`, it should run without long-term memory rather than inferring a shared fallback.

## Browser and Product Surface Changes

### Frontend removal

The existing browser memory surface should be removed:

- remove `/api/memory` same-origin routes
- remove `frontend/src/core/memory/*`
- remove `frontend/src/components/workspace/settings/memory-settings-page.tsx`
- remove the Memory section from the Settings dialog

This is an intentional product change, not a temporary hidden feature.

### Gateway memory routes

The Gateway `/api/memory` router should be removed from the mounted public API surface in this slice.

The previous CRUD-style memory management contract is no longer part of the product path.

### Channel command behavior

Any existing IM or command-path `/memory` command should be removed or changed to a clear "not available" response.

The old command must not imply that browser-editable file-backed memory still exists.

## Configuration

Add Mem0 runtime configuration under the DeerFlow memory configuration surface.

Required configuration should include at least:

- `enabled`
- `provider`
- `base_url` or equivalent Mem0 endpoint configuration
- authentication material required by the chosen OSS deployment
- retrieval result limit
- write enable/disable flag
- optional debug logging controls

These settings belong in runtime configuration, not BFF configuration.

## Error Handling

Expected runtime behavior:

- if memory retrieval fails, chat continues without injected long-term memory
- if memory persistence fails, chat still completes and the failure is logged
- missing `user_id` is treated as "memory disabled for this run", not as an error
- Mem0 outages must not take down the core chat path

Expected product behavior:

- no browser memory UI remains that could expose backend storage failures to end users

## Testing

### Runtime tests

Add or update tests for:

- Mem0 adapter initialization and scoped calls by `user_id`
- request-time memory retrieval and injection
- updater writes using `user_id`
- missing `user_id` causes safe skip behavior
- different users remain isolated
- the same user shares memory across multiple agents
- memory retrieval or write failures degrade without breaking chat

### BFF tests

Add coverage proving chat stream requests include authenticated `user_id` in downstream context.

### Frontend tests

Update settings and boundary tests so they reflect that Memory is no longer a browser-facing settings section or same-origin API path.

## Documentation

Update documentation when implemented:

- `backend/README.md`
- `backend/CLAUDE.md`
- `bff/README.md`
- `bff/docs/ROADMAP.md`
- `frontend/README.md`
- `frontend/AGENTS.md`

Documentation should make the new ownership model explicit:

- BFF owns identity and boundary
- runtime owns memory behavior
- Mem0 OSS backs long-term memory
- browser memory CRUD is removed from the current product surface

## Migration

This slice does not migrate existing `memory.json` data.

The migration decision is:

- existing file-backed memory remains historical only
- new long-term memory starts fresh in Mem0

If migration becomes necessary later, it should be implemented as a separate offline import tool with explicit operator intent.

## Risks

The largest implementation risk is not the Mem0 SDK itself. It is refactoring memory from a static prompt concern into a request-scoped runtime concern without regressing chat behavior.

Specific risks:

- memory injection accidentally remaining cached across users
- `user_id` not reaching runtime consistently
- browser/UI references to removed memory features lingering after backend removal
- hidden entrypoints still assuming file-backed memory APIs exist

The design reduces these risks by:

- making `user_id` the only memory scope
- skipping memory entirely when `user_id` is absent
- removing the old browser memory surface instead of attempting a partial compatibility layer
- keeping Mem0 integration inside `deerflow-harness`

## Future Work

Explicitly deferred follow-ups:

- offline import from historical `memory.json`
- a new product-facing memory inspection or editing UI
- richer metadata or hybrid scoping beyond `user_id`
- switching from SDK integration to a dedicated internal memory service if the architecture later needs that separation
