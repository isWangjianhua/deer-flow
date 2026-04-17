# Mem0 Retrieval Policy Design

Date: 2026-04-17

## Summary

Define a production-oriented retrieval policy for `memory.provider=mem0` that goes beyond naive "last user message only" search while staying lighter than a full memory architecture rewrite.

This slice defines:

- how authenticated runs should retrieve user-scoped long-term memory from Mem0
- how retrieval behavior should differ for first-turn, multi-turn, and cold-start scenarios
- how profile memories and query-relevant memories should be combined
- how token budget and deduplication should constrain the injected memory block

This slice intentionally does not include:

- migrating historical `memory.json` data into Mem0
- redesigning the browser memory UI
- rewriting the legacy compatibility memory shape out of the system
- introducing model-based query rewriting in the first iteration

## Problem

The currently implemented Mem0 runtime path is a meaningful improvement over the legacy global `memory.json` flow, but its retrieval policy is still only partially mature.

The current behavior is:

- authenticated runs use `user_id` scope
- Mem0 memories are retrieved at request time
- retrieval is based on a recent user-message window
- cold start degrades safely when no memory is found

This is a solid baseline, but it still leaves a gap:

- new threads should still benefit from stable user profile memory even before enough conversation context accumulates
- multi-turn retrieval should use conversational context more intentionally than a raw recent-message window alone
- the retrieval pipeline should distinguish stable profile memory from task-relevant semantic memory
- the injected memory block should be explicitly budgeted and deduplicated rather than relying on a single retrieval source

## Goals

- Keep `user_id` as the only memory scope for authenticated Mem0 runs.
- Introduce two retrieval paths:
  - `profile retrieval`
  - `query retrieval`
- Support three runtime modes:
  - new thread first turn
  - multi-turn continuation
  - first-time user / cold start
- Keep the implementation lightweight enough to fit the current runtime architecture.
- Avoid over-injecting irrelevant memories into the model call.
- Preserve graceful degradation when no memories exist or retrieval returns nothing.

## Non-Goals

- Do not introduce a full profile synthesis pipeline in this slice.
- Do not add LLM-based query rewriting in the first implementation.
- Do not replace Mem0 with LangGraph store in this slice.
- Do not change memory write-back scope away from `user_id`.
- Do not make browser memory CRUD part of this design.

## Current Context

Relevant current implementation details:

- `backend/packages/harness/deerflow/agents/middlewares/mem0_injection_middleware.py` retrieves memory from Mem0 using a recent user-message window
- `backend/packages/harness/deerflow/agents/memory/mem0_service.py` supports `search()` and `get_all()` under `user_id`
- `backend/packages/harness/deerflow/agents/memory/prompt.py` still provides compatibility formatting into the existing `<memory>` block shape
- `backend/packages/harness/deerflow/agents/lead_agent/prompt.py` disables static prompt-time memory loading when `provider=mem0`
- `backend/packages/harness/deerflow/agents/middlewares/memory_middleware.py` and `backend/packages/harness/deerflow/agents/memory/updater.py` already write authenticated conversations back into Mem0

This means the missing piece is not storage or write-back. The missing piece is retrieval policy sophistication.

## Chosen Approach

Use a two-channel retrieval policy:

1. `profile retrieval`
2. `query retrieval`

The final injected memory block is the merged, deduplicated, token-budgeted result of both channels.

The policy should behave differently by interaction stage:

### 1. First-time user / cold start

If the current `user_id` has no stored memories:

- profile retrieval returns empty
- query retrieval may also return empty
- no memory is injected
- the run proceeds normally
- post-run memory write-back continues as usual

This is the required graceful cold-start behavior.

### 2. New thread, first user turn

On the first meaningful user turn in a thread:

- perform `profile retrieval`
- perform `first-message query retrieval`
- merge the results
- inject the merged block into the model call

This ensures the assistant sees stable user background plus the memories most relevant to the current first-turn request.

### 3. Multi-turn continuation

After the first turn:

- perform `profile retrieval`
- perform `conversation-aware query retrieval`
- merge the results
- inject the merged block into the model call

The multi-turn path uses a recent user-message window as the query basis in the first implementation.

## Retrieval Channels

### Profile retrieval

Purpose:

- bring in a small amount of durable, user-profile-like memory
- provide continuity even when the immediate query is sparse

Source:

- Mem0 `get_all(user_id=...)`

Selection rules:

- prefer stable categories such as `preference`, `context`, and `knowledge`
- treat `goal` as lower-priority profile material
- exclude or heavily down-rank `correction` memories unless they are clearly durable and broadly useful
- sort by a combination of recency and confidence
- inject only a small top slice, not the full memory set

### Query retrieval

Purpose:

- bring in memories relevant to the current task or question

Source:

- Mem0 `search(query=..., filters={"user_id": ...}, limit=...)`

Query construction rules:

- first turn in thread:
  - use the first meaningful user message
- later turns:
  - use a recent window of up to `N` user turns
- the initial implementation should be rule-based, not model-rewritten

## Merge Policy

Profile and query retrieval results should be merged with explicit rules:

1. deduplicate by normalized memory content or stable memory id
2. preserve query-relevant memories first when conflicts occur
3. reserve a smaller share of the token budget for profile memories
4. reserve the larger share for query memories

Recommended initial budget split:

- profile retrieval: `30%`
- query retrieval: `70%`

This avoids profile memories crowding out current-task relevance.

## Token Budget Policy

Memory injection must remain compact.

The retrieval pipeline should:

- apply a hard upper bound from `memory.max_injection_tokens`
- allocate that budget across profile/query channels
- trim low-priority results first
- rely on the existing `format_memory_for_injection(...)` output path for final text shaping

## New Configuration

The retrieval policy should add a few Mem0-specific settings under `memory`:

- `profile_limit`
  - max number of profile memories considered before formatting
- `query_window_turns`
  - max number of recent human turns included in the conversational query window
- `profile_budget_ratio`
  - fraction of total memory injection token budget reserved for profile retrieval
- optional `profile_categories`
  - list of categories treated as profile-eligible

These should be optional and receive conservative defaults so existing `mem0` users do not have to configure them immediately.

## File Boundaries

### `backend/packages/harness/deerflow/agents/memory/memory_retrieval.py`

New file.

Responsibility:

- build retrieval policy inputs
- determine first-turn vs multi-turn behavior
- perform profile retrieval selection
- perform query retrieval selection
- merge and deduplicate results
- build the final compatibility memory payload for injection

This keeps retrieval policy out of the middleware itself.

### `backend/packages/harness/deerflow/agents/middlewares/mem0_injection_middleware.py`

Should become thin orchestration only.

Responsibility:

- read `user_id`
- call retrieval policy
- inject the resulting `SystemMessage`

It should not directly encode the full retrieval strategy.

### `backend/packages/harness/deerflow/agents/memory/mem0_service.py`

Should remain a thin adapter over Mem0 operations.

Responsibility:

- `search`
- `get_all`
- `add_conversation`
- optional delete/import helpers

It should not own high-level retrieval policy.

## Alternatives Considered

### Option 1: Keep only recent-user-window query retrieval

Pros:

- simplest implementation
- already mostly implemented

Cons:

- weak first-turn behavior for sparse user questions
- underuses stable profile memory
- less mature for B2B and long-running user relationships

### Option 2: Add profile retrieval + query retrieval (chosen)

Pros:

- better first-turn quality
- stronger user continuity across threads
- still lightweight
- aligns with profile-vs-collection memory distinctions in LangGraph-style memory thinking

Cons:

- slightly more implementation complexity
- requires token-budget and deduplication rules

### Option 3: Add LLM-based query rewriting now

Pros:

- potentially strongest retrieval quality

Cons:

- more latency
- more moving parts
- harder to validate
- unnecessary before the simpler dual-retrieval policy is in place

Option 2 is the chosen approach.

## Validation Criteria

This policy is successful if:

- first-turn retrieval in new threads includes stable user background when it exists
- later turns use conversational context rather than only the last message
- new users start cleanly with no errors and no hallucinated memory
- the injected memory block remains compact and relevant
- profile memories do not overwhelm task-relevant memories

This policy is insufficient if:

- new-thread first turns still feel like cold starts for existing users
- query retrieval dominates so heavily that stable profile memory is never seen
- profile retrieval dominates so heavily that current-task relevance suffers
- token usage grows noticeably due to over-injection

## Risks

The main risks are:

- over-injecting profile memory and reducing task relevance
- weak heuristics for choosing profile-eligible memories
- duplicate memories appearing when profile and query channels overlap
- false first-turn detection in edge cases

These are mitigated by:

- strict profile/query budget split
- deterministic deduplication
- conservative defaults
- preserving graceful fallback to "no injection"

## Rollout

Recommended rollout order:

1. Add retrieval policy module
2. Add config knobs with defaults
3. Update `Mem0InjectionMiddleware` to call retrieval policy
4. Add tests for first-turn, multi-turn, and cold-start behavior
5. Observe injection quality before considering query rewriting

## Follow-Up

Once this policy is stable, later improvements may include:

- query rewriting for ambiguous follow-ups
- profile memory compaction or caching
- category-aware ranking
- hybrid retrieval with explicit correction-memory gating
