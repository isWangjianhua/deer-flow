# Streaming Output Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** completed on `2026-04-11`

**Goal:** Repair the current `frontend -> BFF -> gateway/agentruntime` streaming path so failures propagate correctly, tool lifecycle events stay consistent, post-stream sync does not block delivery, and the browser-facing hop preserves SSE anti-buffering behavior.

**Architecture:** Keep the current BFF chat protocol, but repair the points where semantics are lost: normalize gateway `error` into the existing frontend-visible failure contract, stop inferring tool completion from every tool chunk, decouple conversation sync from the SSE response generator, and preserve anti-buffering configuration on the browser-facing path. Validate with focused pytest, frontend unit tests where needed, and one browser-facing streaming verification.

**Tech Stack:** FastAPI BFF, Next.js App Router, nginx, SSE over `fetch` + `ReadableStream`, pytest, Node.js `node:test`, Playwright.

## Completion Notes

This implementation finished with the following actual outcomes:

- gateway `error` is normalized into `run.failed`
- `message.completed` is not emitted after known downstream failure
- `ToolMessageChunk` no longer implies `tool.completed`
- post-stream conversation sync is best-effort and not on the active SSE hot path
- the browser-facing Next.js route and nginx path preserve explicit anti-buffering behavior
- BFF route tests no longer depend on the hanging `TestClient` path

Additional root-cause work completed during implementation:

- the pytest hang was isolated from the streaming bug itself
- the hang was narrowed to sync FastAPI handler/dependency execution under the current
  in-process test stack
- the tested BFF auth/session path was converted to async and the route tests now run
  against a small `httpx.ASGITransport` based client

## Final Verification Evidence

Focused verification completed successfully:

```bash
cd /home/mnze/projects/deer-flow-agentruntime/.worktrees/streaming-fix/bff
/home/mnze/projects/deer-flow-agentruntime/bff/.venv/bin/pytest tests/api/test_auth_routes.py::test_login_returns_bearer_token -q
/home/mnze/projects/deer-flow-agentruntime/bff/.venv/bin/pytest tests/test_health.py tests/api/test_auth_routes.py tests/api/test_stream_routes.py -q
/home/mnze/projects/deer-flow-agentruntime/bff/.venv/bin/pytest tests/api/test_bff_chat_stream_contract.py -q
```

Observed result:

- auth regression test: `1 passed`
- route/health/auth group: `9 passed`
- stream contract suite: `9 passed`

Browser-facing verification also completed through real local services on:

- `gateway:8001`
- `bff:9000`
- `frontend:3000`
- `nginx:2026`

Observed result:

- local login, conversation creation, and streaming all returned `200`
- `nginx:2026` returned `text/event-stream` and incremental `message.delta` lines
- post-stream conversation title sync completed successfully

---

## File Structure

### Modify

- `bff/app/sse/proxy.py`
- `bff/app/api/routes/conversations.py`
- `bff/app/services/conversation_service.py`
- `bff/tests/api/test_bff_chat_stream_contract.py`
- `bff/tests/api/test_stream_routes.py`
- `frontend/src/app/api/bff/conversations/[conversation_id]/messages/stream/route.ts`
- `docker/nginx/nginx.conf`
- `docker/nginx/nginx.local.conf`

### Possibly modify, only if event-contract handling requires it

- `frontend/src/core/bff-chat/types.ts`
- `frontend/src/core/bff-chat/hooks.ts`
- `frontend/src/core/bff-chat/state.ts`
- `frontend/src/core/bff-chat/state.test.ts`
- `frontend/tests/e2e/chat.spec.ts`

## Task 1: Add Failing BFF Stream Contract Regressions

**Files:**
- Modify: `bff/tests/api/test_bff_chat_stream_contract.py`
- Test: `bff/tests/api/test_bff_chat_stream_contract.py`

- [ ] **Step 1: Add a failing test for gateway `error` normalization**

Extend `bff/tests/api/test_bff_chat_stream_contract.py` with a case that feeds:

```python
events = normalizer.normalize("error", {"message": "boom", "name": "ValueError"})
assert events == [
    {
        "event": "run.failed",
        "data": {"message": "boom", "name": "ValueError"},
    }
]
```

- [ ] **Step 2: Add a failing test that `end` does not imply success after failure**

Add a test that first starts a message, then emits `error`, then `end`, and asserts
that no `message.completed` event is produced after the known failure.

- [ ] **Step 3: Add a failing test for repeated tool chunks**

Add a test that feeds two `ToolMessageChunk` events for the same `tool_call_id` and
asserts that progress is preserved but completion is not emitted twice or
prematurely.

- [ ] **Step 4: Run the focused contract test file**

Run:

```bash
cd /home/mnze/projects/deer-flow-agentruntime/.worktrees/streaming-fix/bff && UV_CACHE_DIR=/tmp/codex-uv-cache uv run pytest tests/api/test_bff_chat_stream_contract.py -q
```

Expected: FAIL on the newly added assertions.

## Task 2: Add Failing Route Regression For Post-Stream Sync

**Files:**
- Modify: `bff/tests/api/test_stream_routes.py`
- Test: `bff/tests/api/test_stream_routes.py`

- [ ] **Step 1: Add a failing route test for non-fatal sync failure**

Add a test that:

- patches `DeerFlowClient.stream_message` to return a valid stream
- patches `DeerFlowClient.get_thread_history` to raise `httpx.ConnectError`
- calls `POST /conversations/{conversation_id}/messages/stream`
- asserts the response status is still `200`
- asserts streamed `message.completed` content is still present

- [ ] **Step 2: Re-run the focused route tests**

Run:

```bash
cd /home/mnze/projects/deer-flow-agentruntime/.worktrees/streaming-fix/bff && UV_CACHE_DIR=/tmp/codex-uv-cache uv run pytest tests/api/test_stream_routes.py -q
```

Expected: FAIL because the current stream path still blocks on post-stream sync.

## Task 3: Repair BFF Stream Normalization

**Files:**
- Modify: `bff/app/sse/proxy.py`
- Test: `bff/tests/api/test_bff_chat_stream_contract.py`

- [ ] **Step 1: Implement minimal state tracking for downstream failure**

Update `StreamEventNormalizer` to record when a downstream run failure has
occurred so later `end` handling can avoid emitting synthetic success.

- [ ] **Step 2: Normalize gateway `error` into the frontend failure contract**

Extend `normalize()` in `bff/app/sse/proxy.py` so gateway `error` events produce
the existing frontend-visible failure event and payload.

- [ ] **Step 3: Stop marking every tool chunk as completed**

Revise the `tool` / `ToolMessageChunk` handling so progress can continue without
immediately emitting `tool.completed` for each chunk. Only emit completion if a
real completion boundary is available in the current stream path.

- [ ] **Step 4: Run the BFF contract tests**

Run:

```bash
cd /home/mnze/projects/deer-flow-agentruntime/.worktrees/streaming-fix/bff && UV_CACHE_DIR=/tmp/codex-uv-cache uv run pytest tests/api/test_bff_chat_stream_contract.py -q
```

Expected: PASS.

## Task 4: Remove Blocking Sync From The SSE Hot Path

**Files:**
- Modify: `bff/app/api/routes/conversations.py`
- Modify: `bff/app/services/conversation_service.py`
- Test: `bff/tests/api/test_stream_routes.py`

- [ ] **Step 1: Make post-stream sync non-blocking from the route perspective**

Change the route so the streaming generator is only responsible for streaming
output. Do not await history sync inline after the final SSE chunk has been
yielded.

- [ ] **Step 2: Keep conversation snapshot refresh failure non-fatal**

Adjust the BFF service interaction so a downstream history failure after stream
delivery does not convert the route into a failed response.

- [ ] **Step 3: Run the BFF route tests**

Run:

```bash
cd /home/mnze/projects/deer-flow-agentruntime/.worktrees/streaming-fix/bff && UV_CACHE_DIR=/tmp/codex-uv-cache uv run pytest tests/api/test_stream_routes.py -q
```

Expected: PASS.

## Task 5: Preserve Anti-Buffering On The Browser-Facing Hop

**Files:**
- Modify: `frontend/src/app/api/bff/conversations/[conversation_id]/messages/stream/route.ts`
- Modify: `docker/nginx/nginx.conf`
- Modify: `docker/nginx/nginx.local.conf`

- [ ] **Step 1: Update the Next.js BFF stream bridge route**

Ensure the route restates or preserves explicit SSE anti-buffering behavior in
the browser-facing response headers rather than only forwarding `content-type`
and `cache-control`.

- [ ] **Step 2: Update nginx frontend proxying**

Add the missing non-buffering configuration on the frontend-facing proxy path so
the BFF streaming route is not re-buffered before reaching the browser.

- [ ] **Step 3: Add or update verification for browser-facing streaming**

Use the smallest test that can check the presence of the intended response
behavior. Prefer existing chat e2e coverage if it can verify incremental stream
visibility without broadening scope.

## Task 6: Frontend Follow-Through Only If Needed

**Files:**
- Modify if required: `frontend/src/core/bff-chat/types.ts`
- Modify if required: `frontend/src/core/bff-chat/hooks.ts`
- Modify if required: `frontend/src/core/bff-chat/state.ts`
- Modify if required: `frontend/src/core/bff-chat/state.test.ts`

- [ ] **Step 1: Check whether the repaired BFF payload still matches frontend assumptions**

Only change frontend code if the existing `run.failed` handling or message/tool
state logic no longer matches the repaired BFF output.

- [ ] **Step 2: If frontend changes are needed, add a failing unit test first**

Use the existing `node:test` files under `frontend/src/core/bff-chat/` and
cover only the changed behavior.

- [ ] **Step 3: Implement the minimal frontend adjustment**

Keep the public BFF chat contract stable unless the BFF repair makes a small
compatibility change unavoidable.

## Task 7: Focused Verification

**Files:**
- Test: `bff/tests/api/test_bff_chat_stream_contract.py`
- Test: `bff/tests/api/test_stream_routes.py`
- Test if needed: `frontend/src/core/bff-chat/*.test.ts`
- Test if needed: `frontend/tests/e2e/chat.spec.ts`

- [ ] **Step 1: Run the BFF regression suite together**

Run:

```bash
cd /home/mnze/projects/deer-flow-agentruntime/.worktrees/streaming-fix/bff && UV_CACHE_DIR=/tmp/codex-uv-cache uv run pytest tests/api/test_bff_chat_stream_contract.py tests/api/test_stream_routes.py -q
```

Expected: PASS.

- [ ] **Step 2: Run any touched frontend unit tests**

If no frontend core files changed, skip this step. Otherwise run only the tests
for the touched files.

- [ ] **Step 3: Run one browser-facing verification**

Use the narrowest practical verification of incremental stream delivery on the
current chat route.

- [ ] **Step 4: Summarize residual uncertainty**

If the exact tool completion boundary remains conservative rather than fully
resolved, state that explicitly in the completion notes instead of overstating
certainty.
