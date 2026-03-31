from __future__ import annotations

import pytest

from app.gateway.chat_proxy import (
    build_usechat_headers,
    encode_usechat_text_delta,
    resolve_or_create_conversation,
    usechat_stream_from_langgraph,
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
    frame = encode_usechat_text_delta("text_1", "Hello")

    assert frame.startswith("data: ")
    assert "Hello" in frame


@pytest.mark.anyio
async def test_usechat_stream_from_langgraph_includes_conversation_data_and_done():
    async def upstream():
        yield 'event: messages/partial\ndata: {"text":"Hello"}\n\n'

    frames = []
    async for frame in usechat_stream_from_langgraph(upstream(), conversation_id="conv_1"):
        frames.append(frame)

    joined = "".join(frames)
    assert '"type": "data-conversation"' in joined
    assert '"conversationId": "conv_1"' in joined
    assert '"type": "start"' in joined
    assert '"type": "text-start"' in joined
    assert '"type": "text-delta"' in joined
    assert '"delta": "Hello"' in joined
    assert '"type": "text-end"' in joined
    assert '"type": "finish"' in joined
    assert "data: [DONE]" in joined
