# Streaming Output Repair Handoff

## Branch

- `streaming-fix`

## Completed Scope

This branch completed the streaming repair slice for the BFF-backed chat path and also
separated the unrelated pytest hang from the stream contract work.

Implemented:

- gateway `error` -> frontend-visible `run.failed`
- suppression of synthetic success after known downstream failure
- removal of premature `tool.completed` emission for tool chunks
- non-blocking post-stream conversation sync
- browser-facing SSE anti-buffering updates in Next.js and nginx
- route-test stabilization by switching the tested BFF dependency/handler path to async
- `httpx.ASGITransport` based test client for local BFF route tests

## Key Files

- `bff/app/sse/proxy.py`
- `bff/app/api/routes/conversations.py`
- `bff/app/services/conversation_service.py`
- `bff/app/api/deps.py`
- `bff/app/db/session.py`
- `bff/app/api/routes/auth.py`
- `bff/app/api/routes/users.py`
- `bff/tests/http_client.py`
- `bff/tests/conftest.py`
- `bff/tests/api/test_bff_chat_stream_contract.py`
- `bff/tests/api/test_stream_routes.py`
- `frontend/src/app/api/bff/conversations/[conversation_id]/messages/stream/route.ts`
- `docker/nginx/nginx.conf`
- `docker/nginx/nginx.local.conf`

## Root Cause Notes

### Test hang

The pytest hang was not caused by local auth logic or password hashing. A minimal reproduction
showed that the current in-process test transport could hang on sync FastAPI handlers and sync
dependencies. Converting the tested BFF route path to async removed that failure mode.

### Streaming issues

The stream contract problems were genuine product issues independent from the test hang:

- failure events were dropped
- `end` could imply false success
- tool chunk handling was semantically wrong
- history sync was on the response hot path
- browser-facing anti-buffering was incomplete

## Verification Run

Fresh verification completed in this branch:

- `pytest tests/api/test_auth_routes.py::test_login_returns_bearer_token -q`
- `pytest tests/test_health.py tests/api/test_auth_routes.py tests/api/test_stream_routes.py -q`
- `pytest tests/api/test_bff_chat_stream_contract.py -q`

Real end-to-end streaming verification also completed with local services started from this
worktree using the main workspace's existing `.env`, `config.yaml`, Python virtualenvs, and
frontend `node_modules`.

Observed results:

- `POST /api/auth/local/login` through `nginx:2026` returned `200`
- `POST /api/bff/conversations` through `nginx:2026` returned `200`
- `POST /api/bff/conversations/{id}/messages/stream` through `nginx:2026` returned
  `200 text/event-stream`
- SSE events arrived incrementally with multiple distinct `message.delta` timestamps
- conversation title sync completed after stream delivery

## Residual Follow-Up

Recommended next follow-up, not required for this merge:

1. Add stable browser automation for the live BFF stream path once Playwright is reliable in
   this environment.
2. If the gateway later exposes a stronger tool-finished signal, tighten BFF `tool.completed`
   emission to that boundary.
3. Continue with the existing roadmap priority: uploads/artifacts first, then conversation
   lifecycle work.
