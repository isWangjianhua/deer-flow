# Streaming Output Repair Design

## Scope

This design documents the repair work for the current browser-facing streaming path:

- `frontend -> Next.js BFF route -> FastAPI BFF -> gateway/agentruntime`

The target was to fix real product issues already observed in local integration:

- downstream run failures were not reaching the frontend as failures
- tool chunk events could mark tools complete too early
- post-stream conversation sync could delay or break the active SSE response
- browser-facing proxy hops could still buffer streamed output
- BFF route-level pytest was unstable because the current runtime could hang on sync FastAPI execution paths under test transport

## Confirmed Problems

### 1. Downstream `error` events were not preserved

Gateway failure events were emitted as SSE `error`, but the BFF normalizer only exposed
`run_error`. This meant the frontend could miss the failure entirely and later receive a
synthetic success-like completion event.

### 2. Tool chunks implied premature completion

`ToolMessageChunk` events were being converted into `tool.completed` on every chunk,
which made the frontend tool state inconsistent for multi-chunk tool output.

### 3. Post-stream sync was on the hot path

The BFF conversation stream route awaited history sync work after streaming finished.
If history fetch failed or stalled, the active response could be delayed or terminated
for the user who had already received the streamed answer.

### 4. Anti-buffering headers were incomplete on the browser-facing hop

The BFF frontend bridge and nginx frontend proxy path did not fully restate the intended
SSE anti-buffering behavior, so the final hop could still buffer output.

### 5. Route-level tests were hanging for the wrong reason

The observed pytest hang was not caused by auth logic, SQLite, or password hashing.
The root cause was narrower: under the current FastAPI / Starlette / httpx / Python 3.14
test stack, sync FastAPI handlers and sync dependencies could hang when driven through the
in-process test transport path.

## Implemented Design

### BFF stream normalization

- Normalize downstream gateway `error` into frontend-visible `run.failed`
- Track downstream failure state so `end` does not imply `message.completed`
- Stop inferring `tool.completed` from every `ToolMessageChunk`
- Keep conservative behavior: emit progress during chunks and reserve completion for an
  actual completion boundary

### BFF post-stream sync behavior

- Keep the streaming generator responsible only for active SSE delivery
- Move conversation snapshot refresh out of the synchronous response hot path
- Run post-stream sync as a best-effort background task
- Log sync failures rather than converting a delivered stream into a failed request

### Browser-facing anti-buffering

- Restate explicit SSE response headers in the Next.js bridge route
- Add non-buffering nginx config for the frontend-facing BFF stream route

### Test infrastructure stabilization

- Replace the hanging `TestClient` path with a small `httpx.ASGITransport` based test client
- Convert the tested BFF DB/session/auth execution path to async so route tests no longer
  hit the unstable sync FastAPI test path

## What Is Now True

- Gateway run failures are surfaced to the frontend as `run.failed`
- `message.completed` is not synthesized after a known downstream failure
- Tool progress remains incremental without premature `tool.completed`
- Post-stream history sync no longer blocks the SSE response
- The browser-facing stream route now returns `text/event-stream` with explicit
  `cache-control: no-cache, no-transform`
- Real streaming through `nginx:2026` was observed incrementally, not only as a final batch
- BFF auth and stream route tests no longer hang in local pytest

## Residual Uncertainty

### Browser automation coverage

The live path was verified through real HTTP requests and SSE line timing, but not through
stable Playwright automation in this environment. The Playwright CLI flow did not yield a
usable snapshot here, so browser automation should still be added once that environment is
reliable.

### Tool completion boundary

The current repair intentionally avoids premature completion. If the gateway later exposes a
stronger tool-finished boundary, the BFF can emit `tool.completed` more precisely without
reintroducing the old regression.
