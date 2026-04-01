from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

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


@pytest.mark.anyio
async def test_chat_endpoint_only_forwards_latest_user_message(tmp_path, monkeypatch):
    monkeypatch.setenv("DEER_FLOW_AUTH_DB_PATH", str(tmp_path / "auth.db"))
    import app.gateway.routers.chat as chat

    captured_inputs: list[dict] = []

    async def fake_start_run(body, thread_id, request):
        captured_inputs.append(body.input)
        return SimpleNamespace(run_id="run_1", thread_id=thread_id)

    async def fake_sse_consumer(bridge, record, request, run_mgr):
        yield 'event: messages-tuple\ndata: {"type":"ai","content":"Done","id":"ai_1"}\n\n'

    monkeypatch.setattr(chat, "start_run", fake_start_run)
    monkeypatch.setattr(chat, "sse_consumer", fake_sse_consumer)
    monkeypatch.setattr(chat, "get_stream_bridge", lambda request: object())
    monkeypatch.setattr(chat, "get_run_manager", lambda request: object())

    await chat.chat(
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

    assert captured_inputs == [
        {"messages": [{"role": "user", "content": "做一个简单的html网页"}]}
    ]


@pytest.mark.anyio
async def test_chat_endpoint_creates_conversation_when_missing_id(tmp_path, monkeypatch):
    monkeypatch.setenv("DEER_FLOW_AUTH_DB_PATH", str(tmp_path / "auth.db"))
    import app.gateway.routers.chat as chat

    async def fake_start_run(body, thread_id, request):
        assert body.config["configurable"]["user_id"] == "user_a"
        return SimpleNamespace(run_id="run_1", thread_id=thread_id)

    async def fake_sse_consumer(bridge, record, request, run_mgr):
        yield 'event: messages-tuple\ndata: {"type":"ai","content":"Hello","id":"ai_1"}\n\n'

    monkeypatch.setattr(chat, "start_run", fake_start_run)
    monkeypatch.setattr(chat, "sse_consumer", fake_sse_consumer)
    monkeypatch.setattr(chat, "get_stream_bridge", lambda request: object())
    monkeypatch.setattr(chat, "get_run_manager", lambda request: object())

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
