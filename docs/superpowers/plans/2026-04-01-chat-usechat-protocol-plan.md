# Chat API `useChat` Protocol Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the backend chat endpoint from a custom transitional SSE API to a `POST /api/chat` endpoint that is directly consumable by AI SDK `useChat`, while preserving current auth, ownership, and LangGraph runtime internals.

**Architecture:** Keep conversation CRUD and ownership as they are. Replace the custom `/api/chat/stream` business SSE contract with a `/api/chat` endpoint and move chat output adaptation into a focused `chat_proxy.py` layer that translates internal LangGraph run output into AI SDK-compatible stream frames.

**Tech Stack:** FastAPI, existing Gateway run lifecycle (`start_run`, `sse_consumer`), sqlite-backed ownership helpers, pytest, Starlette `TestClient`

---

## File Structure

### Existing files to modify

- `backend/app/gateway/chat_proxy.py`
  Replace custom business SSE formatting with AI SDK-compatible stream helpers.
- `backend/app/gateway/routers/chat.py`
  Replace `/api/chat/stream` with `/api/chat` and accept `useChat`-style request payloads.
- `backend/app/gateway/app.py`
  Keep chat router mounted, but update docs text if needed.
- `backend/tests/test_chat_proxy.py`
  Replace custom SSE assertions with protocol-level assertions.
- `backend/tests/test_chat_router.py`
  Replace `/api/chat/stream` tests with `/api/chat`.

### Existing files that remain unchanged

- `backend/app/gateway/routers/conversations.py`
- `backend/app/gateway/thread_ownership.py`
- `backend/app/gateway/services.py`

No schema changes are required.

## Task 1: Redesign `chat_proxy.py` for AI SDK-Compatible Stream Output

**Files:**
- Modify: `backend/app/gateway/chat_proxy.py`
- Modify: `backend/tests/test_chat_proxy.py`

- [ ] **Step 1: Replace the current helper tests with protocol-focused failing tests**

```python
from __future__ import annotations

import pytest

from app.gateway.chat_proxy import (
    build_usechat_headers,
    encode_usechat_text_delta,
    resolve_or_create_conversation,
)
from app.gateway.thread_ownership import create_owned_thread


def test_resolve_or_create_conversation_creates_new_owned_record(tmp_path, monkeypatch):
    monkeypatch.setenv("DEER_FLOW_AUTH_DB_PATH", str(tmp_path / "auth.db"))

    record, created = resolve_or_create_conversation(
        conversation_id=None,
        user_id="user_a",
        title="",
    )

    assert created is True
    assert record.user_id == "user_a"


def test_resolve_or_create_conversation_rejects_foreign_owner(tmp_path, monkeypatch):
    monkeypatch.setenv("DEER_FLOW_AUTH_DB_PATH", str(tmp_path / "auth.db"))
    create_owned_thread(user_id="user_a", biz_thread_id="conv_a")

    with pytest.raises(PermissionError):
        resolve_or_create_conversation(conversation_id="conv_a", user_id="user_b", title="")


def test_build_usechat_headers_sets_required_stream_header():
    headers = build_usechat_headers()

    assert headers["x-vercel-ai-ui-message-stream"] == "v1"
    assert headers["Content-Type"] == "text/event-stream"


def test_encode_usechat_text_delta_includes_text_payload():
    frame = encode_usechat_text_delta("Hello")

    assert frame.startswith("data: ")
    assert "Hello" in frame
```

- [ ] **Step 2: Run the helper tests to verify they fail**

Run:

```bash
uv run pytest tests/test_chat_proxy.py -v
```

Expected:

- FAIL because the current helper still exposes the old custom SSE API and does not define the new helpers.

- [ ] **Step 3: Implement the new helper surface**

```python
from __future__ import annotations

import json
from collections.abc import AsyncIterator

from app.gateway.thread_ownership import create_owned_thread, ensure_thread_belongs_to_user


def resolve_or_create_conversation(*, conversation_id: str | None, user_id: str, title: str):
    if conversation_id:
        return ensure_thread_belongs_to_user(biz_thread_id=conversation_id, user_id=user_id), False
    return create_owned_thread(user_id=user_id, title=title), True


def build_usechat_headers() -> dict[str, str]:
    return {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
        "x-vercel-ai-ui-message-stream": "v1",
    }


def _encode_data(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def encode_usechat_text_delta(text: str) -> str:
    return _encode_data({"type": "text-delta", "textDelta": text})
```

- [ ] **Step 4: Add a minimal stream adapter that translates internal chunks into protocol frames**

```python
async def usechat_stream_from_langgraph(upstream: AsyncIterator[str]) -> AsyncIterator[str]:
    async for chunk in upstream:
        if "event: messages/partial" in chunk:
            yield encode_usechat_text_delta(chunk)
            continue
        if "event: error" in chunk:
            yield _encode_data({"type": "error", "errorText": chunk})
            continue
    yield _encode_data({"type": "finish"})
```

- [ ] **Step 5: Re-run the helper tests**

Run:

```bash
uv run pytest tests/test_chat_proxy.py -v
```

Expected:

- PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add backend/app/gateway/chat_proxy.py backend/tests/test_chat_proxy.py
git commit -m "feat: adapt chat proxy to usechat protocol"
```

## Task 2: Replace `/api/chat/stream` with `/api/chat`

**Files:**
- Modify: `backend/app/gateway/routers/chat.py`
- Modify: `backend/tests/test_chat_router.py`

- [ ] **Step 1: Rewrite the router tests to use `POST /api/chat` and `useChat`-style body**

```python
from __future__ import annotations

from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.gateway.thread_ownership import create_owned_thread


def _build_app(chat_module, user_id: str) -> FastAPI:
    app = FastAPI()
    app.include_router(chat_module.router)

    def override_current_user():
        return SimpleNamespace(id=user_id)

    app.dependency_overrides[chat_module.get_current_user] = override_current_user
    return app


def test_chat_endpoint_creates_conversation_when_missing_id(tmp_path, monkeypatch):
    monkeypatch.setenv("DEER_FLOW_AUTH_DB_PATH", str(tmp_path / "auth.db"))
    from app.gateway.routers import chat

    async def fake_start_run(body, thread_id, request):
        return SimpleNamespace(run_id="run_1", thread_id=thread_id)

    async def fake_sse_consumer(bridge, record, request, run_mgr):
        yield 'event: messages/partial\ndata: {"text":"Hello"}\n\n'

    monkeypatch.setattr(chat, "start_run", fake_start_run)
    monkeypatch.setattr(chat, "sse_consumer", fake_sse_consumer)
    monkeypatch.setattr(chat, "get_stream_bridge", lambda request: object())
    monkeypatch.setattr(chat, "get_run_manager", lambda request: object())

    app = _build_app(chat, "user_a")
    with TestClient(app) as client:
        response = client.post(
            "/api/chat",
            json={
                "id": "req_1",
                "messages": [{"role": "user", "content": "Hello"}],
                "body": {},
            },
        )

    assert response.status_code == 200
    assert response.headers["x-vercel-ai-ui-message-stream"] == "v1"
    assert "textDelta" in response.text


def test_chat_endpoint_rejects_foreign_conversation(tmp_path, monkeypatch):
    monkeypatch.setenv("DEER_FLOW_AUTH_DB_PATH", str(tmp_path / "auth.db"))
    create_owned_thread(user_id="user_a", biz_thread_id="conv_a")
    from app.gateway.routers import chat

    async def fake_start_run(body, thread_id, request):
        return SimpleNamespace(run_id="run_1", thread_id=thread_id)

    async def fake_sse_consumer(bridge, record, request, run_mgr):
        yield 'event: messages/partial\ndata: {"text":"Hello"}\n\n'

    monkeypatch.setattr(chat, "start_run", fake_start_run)
    monkeypatch.setattr(chat, "sse_consumer", fake_sse_consumer)
    monkeypatch.setattr(chat, "get_stream_bridge", lambda request: object())
    monkeypatch.setattr(chat, "get_run_manager", lambda request: object())

    app = _build_app(chat, "user_b")
    with TestClient(app) as client:
        response = client.post(
            "/api/chat",
            json={
                "id": "req_1",
                "messages": [{"role": "user", "content": "Hello"}],
                "body": {"conversation_id": "conv_a"},
            },
        )

    assert response.status_code == 404
```

- [ ] **Step 2: Run the router tests to verify they fail**

Run:

```bash
uv run pytest tests/test_chat_router.py -v
```

Expected:

- FAIL because the router still serves `/api/chat/stream` and expects the old request body.

- [ ] **Step 3: Replace the chat router request/response contract**

```python
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.gateway.chat_proxy import (
    build_usechat_headers,
    resolve_or_create_conversation,
    usechat_stream_from_langgraph,
)
from app.gateway.deps import get_current_user, get_run_manager, get_stream_bridge
from app.gateway.routers.thread_runs import RunCreateRequest
from app.gateway.services import sse_consumer, start_run

router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatMessage(BaseModel):
    role: str
    content: str


class UseChatRequest(BaseModel):
    id: str | None = None
    messages: list[ChatMessage] = Field(default_factory=list)
    body: dict[str, Any] = Field(default_factory=dict)


@router.post("")
async def chat(body: UseChatRequest, request: Request, user=Depends(get_current_user)) -> StreamingResponse:
    conversation_id = body.body.get("conversation_id")
    try:
        record, _created = resolve_or_create_conversation(
            conversation_id=conversation_id,
            user_id=user.id,
            title="",
        )
    except PermissionError as exc:
        raise HTTPException(status_code=404, detail="Conversation not found") from exc

    run_body = RunCreateRequest(
        assistant_id="lead_agent",
        input={
            "messages": [
                {"role": message.role, "content": message.content}
                for message in body.messages
            ]
        },
        metadata={"source": "usechat-proxy"},
        config={"configurable": {"thread_id": record.id}},
        stream_mode=["messages-tuple"],
    )
    run_record = await start_run(run_body, record.id, request)
    bridge = get_stream_bridge(request)
    run_mgr = get_run_manager(request)
    upstream = sse_consumer(bridge, run_record, request, run_mgr)

    return StreamingResponse(
        usechat_stream_from_langgraph(upstream),
        media_type="text/event-stream",
        headers=build_usechat_headers(),
    )
```

- [ ] **Step 4: Re-run the router tests**

Run:

```bash
uv run pytest tests/test_chat_router.py -v
```

Expected:

- PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add backend/app/gateway/routers/chat.py backend/tests/test_chat_router.py
git commit -m "feat: replace chat stream endpoint with usechat api"
```

## Task 3: Re-verify the Targeted Backend Suite

**Files:**
- No new files
- Verify existing suite only

- [ ] **Step 1: Run the targeted backend suite**

Run:

```bash
uv run pytest \
  tests/test_auth_router.py \
  tests/test_current_user_deps.py \
  tests/test_thread_ownership.py \
  tests/test_threads_router.py \
  tests/test_conversations_router.py \
  tests/test_chat_proxy.py \
  tests/test_chat_router.py -v
```

Expected:

- PASS with all targeted backend tests green.

- [ ] **Step 2: Commit any final cleanup if required**

```bash
git status --short
```

Expected:

- no unexpected modified files remain

## Self-Review Notes

- Spec coverage:
  - keep conversations CRUD: unchanged and re-verified in Task 3
  - replace `/api/chat/stream` with `/api/chat`: Task 2
  - AI SDK-compatible response/header: Task 1 and Task 2
  - preserve auth/ownership/runtime internals: no plan step changes those layers
- Placeholder scan:
  - no `TODO`/`TBD` placeholders remain
- Type consistency:
  - request uses `id/messages/body`
  - external selector remains `conversation_id`
  - internal runtime id remains `record.id`
