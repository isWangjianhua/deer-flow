from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.gateway.routers.chat import _extract_historical_message_ids
from app.gateway.thread_ownership import create_owned_thread


async def _collect_streaming_body(response) -> str:
    parts: list[str] = []
    async for chunk in response.body_iterator:
        if isinstance(chunk, bytes):
            parts.append(chunk.decode("utf-8"))
        else:
            parts.append(str(chunk))
    return "".join(parts)


def test_usechat_request_accepts_ui_message_parts():
    import app.gateway.routers.chat as chat

    request = chat.UseChatRequest.model_validate(
        {
            "id": "req_1",
            "messages": [
                {
                    "id": "msg_1",
                    "role": "user",
                    "parts": [
                        {"type": "text", "text": "Hello"},
                        {"type": "text", "text": "World"},
                    ],
                }
            ],
            "body": {},
        }
    )

    assert request.messages[0].content == "Hello\nWorld"


def test_extract_historical_message_ids_from_thread_state_values():
    values = {
        "messages": [
            {"type": "human", "id": "human_1", "content": "深圳明天天气"},
            {"type": "ai", "id": "ai_1", "content": "", "tool_calls": [{"id": "call_1", "name": "web_search"}]},
            {"type": "tool", "id": "tool_1", "tool_call_id": "call_1", "name": "web_search", "content": {"results": []}},
            {"type": "ai", "content": "missing id should be ignored"},
            "invalid",
        ]
    }

    assert _extract_historical_message_ids(values) == {"human_1", "ai_1", "tool_1"}


@pytest.mark.anyio
async def test_chat_endpoint_only_forwards_latest_user_message(tmp_path, monkeypatch):
    monkeypatch.setenv("DEER_FLOW_AUTH_DB_PATH", str(tmp_path / "auth.db"))
    import app.gateway.routers.chat as chat

    captured: dict[str, object] = {}

    async def fake_stream_thread_run(*, thread_id, payload, request):
        captured["thread_id"] = thread_id
        captured["payload"] = payload
        yield 'event: messages-tuple\ndata: {"type":"ai","content":"Done","id":"ai_1"}\n\n'

    monkeypatch.setattr(chat, "stream_thread_run", fake_stream_thread_run)
    ensured: list[tuple[str, object]] = []
    async def fake_ensure_runtime_thread(*, record, request, metadata=None):
        ensured.append((record.id, metadata))

    monkeypatch.setattr(chat.threads, "ensure_runtime_thread", fake_ensure_runtime_thread)

    response = await chat.chat(
        body=chat.UseChatRequest(
            id="req_1",
            messages=[
                chat.ChatMessage(role="user", content="你好"),
                chat.ChatMessage(role="assistant", content="你好！"),
                chat.ChatMessage(role="user", content="做一个简单的html网页"),
            ],
            body={},
        ),
        request=SimpleNamespace(),
        user=SimpleNamespace(id="user_a"),
    )
    await _collect_streaming_body(response)

    assert captured["thread_id"]
    assert ensured
    assert captured["payload"] == {
        "assistant_id": "lead_agent",
        "input": {"messages": [{"role": "user", "content": "做一个简单的html网页"}]},
        "metadata": {"source": "usechat-proxy"},
        "config": {
            "configurable": {
                "thread_id": captured["thread_id"],
                "user_id": "user_a",
            }
        },
        "stream_mode": ["messages-tuple", "values"],
    }


@pytest.mark.anyio
async def test_chat_endpoint_creates_conversation_when_missing_id(tmp_path, monkeypatch):
    monkeypatch.setenv("DEER_FLOW_AUTH_DB_PATH", str(tmp_path / "auth.db"))
    import app.gateway.routers.chat as chat

    async def fake_stream_thread_run(*, thread_id, payload, request):
        assert payload["config"]["configurable"]["user_id"] == "user_a"
        yield 'event: messages-tuple\ndata: {"type":"ai","content":"Hello","id":"ai_1"}\n\n'

    monkeypatch.setattr(chat, "stream_thread_run", fake_stream_thread_run)
    ensured: list[str] = []
    async def fake_ensure_runtime_thread(*, record, request, metadata=None):
        ensured.append(record.id)

    monkeypatch.setattr(chat.threads, "ensure_runtime_thread", fake_ensure_runtime_thread)

    response = await chat.chat(
        body=chat.UseChatRequest(
            id="req_1",
            messages=[chat.ChatMessage(role="user", content="Hello")],
            body={},
        ),
        request=SimpleNamespace(),
        user=SimpleNamespace(id="user_a"),
    )

    assert response.headers["x-vercel-ai-ui-message-stream"] == "v1"
    assert len(ensured) == 1
    payload = await _collect_streaming_body(response)
    assert '"type": "data-conversation"' in payload
    assert '"conversationId": "' in payload
    assert '"type": "text-delta"' in payload
    assert "data: [DONE]" in payload


@pytest.mark.anyio
async def test_chat_endpoint_rejects_foreign_conversation(tmp_path, monkeypatch):
    monkeypatch.setenv("DEER_FLOW_AUTH_DB_PATH", str(tmp_path / "auth.db"))
    create_owned_thread(user_id="user_a", biz_thread_id="conv_a")
    import app.gateway.routers.chat as chat

    with pytest.raises(HTTPException) as exc_info:
        await chat.chat(
            body=chat.UseChatRequest(
                id="req_1",
                messages=[chat.ChatMessage(role="user", content="Hello")],
                body={"conversation_id": "conv_a"},
            ),
            request=SimpleNamespace(),
            user=SimpleNamespace(id="user_b"),
        )

    assert exc_info.value.status_code == 404


@pytest.mark.anyio
async def test_chat_endpoint_ignores_missing_thread_state_when_collecting_history(tmp_path, monkeypatch):
    monkeypatch.setenv("DEER_FLOW_AUTH_DB_PATH", str(tmp_path / "auth.db"))
    import app.gateway.routers.chat as chat

    async def fake_stream_thread_run(*, thread_id, payload, request):
        yield 'event: messages-tuple\ndata: {"type":"ai","content":"Hello","id":"ai_1"}\n\n'

    monkeypatch.setattr(
        chat,
        "resolve_or_create_conversation",
        lambda **_: (SimpleNamespace(id="conv_existing", langgraph_thread_id="lg_conv_existing"), False),
    )
    monkeypatch.setattr(chat.threads, "ensure_runtime_thread", _noop_ensure_runtime_thread)
    monkeypatch.setattr(chat.threads, "load_thread_state", _raise_missing_thread_state)
    monkeypatch.setattr(chat, "stream_thread_run", fake_stream_thread_run)

    response = await chat.chat(
        body=chat.UseChatRequest(
            id="req_1",
            messages=[chat.ChatMessage(role="user", content="Hello")],
            body={"conversation_id": "conv_existing"},
        ),
        request=SimpleNamespace(),
        user=SimpleNamespace(id="user_a"),
    )

    payload = await _collect_streaming_body(response)
    assert '"delta": "Hello"' in payload


async def _raise_missing_thread_state(*args, **kwargs):
    raise HTTPException(status_code=404, detail="Thread conv_existing not found")


async def _noop_ensure_runtime_thread(*args, **kwargs):
    return None
