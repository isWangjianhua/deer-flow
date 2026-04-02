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
        yield 'event: messages-tuple\ndata: {"type":"ai","content":"Hello","id":"ai_1"}\n\n'

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


@pytest.mark.anyio
async def test_usechat_stream_from_langgraph_ignores_empty_ai_chunks():
    async def upstream():
        yield 'event: messages-tuple\ndata: {"type":"ai","content":"","id":"ai_1","tool_calls":[{"name":"search"}]}\n\n'
        yield 'event: messages-tuple\ndata: {"type":"ai","content":"Final text","id":"ai_1"}\n\n'

    frames = []
    async for frame in usechat_stream_from_langgraph(upstream(), conversation_id="conv_1"):
        frames.append(frame)

    joined = "".join(frames)
    assert joined.count('"type": "text-start"') == 1
    assert '"delta": "Final text"' in joined


@pytest.mark.anyio
async def test_usechat_stream_from_langgraph_parses_real_messages_event_tuple():
    async def upstream():
        yield 'event: messages\ndata: [{"id":"ai-1","content":"Hello","type":"AIMessageChunk"},{"langgraph_node":"agent"}]\n\n'
        yield 'event: messages\ndata: [{"id":"ai-1","content":" world","type":"AIMessageChunk"},{"langgraph_node":"agent"}]\n\n'

    frames = []
    async for frame in usechat_stream_from_langgraph(upstream(), conversation_id="conv_1"):
        frames.append(frame)

    joined = "".join(frames)
    assert joined.count('"type": "text-start"') == 1
    assert '"delta": "Hello"' in joined
    assert '"delta": " world"' in joined


@pytest.mark.anyio
async def test_usechat_stream_from_langgraph_ignores_tool_messages():
    async def upstream():
        yield 'event: messages\ndata: [{"id":"tool-1","content":"{\\"results\\": []}","type":"tool"},{"langgraph_node":"tools"}]\n\n'
        yield 'event: messages\ndata: [{"id":"ai-1","content":"Final answer","type":"AIMessageChunk"},{"langgraph_node":"agent"}]\n\n'

    frames = []
    async for frame in usechat_stream_from_langgraph(upstream(), conversation_id="conv_1"):
        frames.append(frame)

    joined = "".join(frames)
    assert '{\\"results\\": []}' not in joined
    assert '"delta": "Final answer"' in joined


@pytest.mark.anyio
async def test_usechat_stream_from_langgraph_emits_tool_progress_parts():
    async def upstream():
        yield (
            'event: messages-tuple\n'
            'data: {"type":"ai","content":"","id":"ai_1","tool_calls":[{"name":"web_search","args":{"query":"上海明天天气"},"id":"call_1"}]}\n\n'
        )
        yield (
            'event: messages-tuple\n'
            'data: {"type":"tool","content":"{\\"results\\": []}","name":"web_search","tool_call_id":"call_1","id":"tool_1"}\n\n'
        )
        yield 'event: messages-tuple\ndata: {"type":"ai","content":"Final answer","id":"ai_1"}\n\n'

    frames = []
    async for frame in usechat_stream_from_langgraph(upstream(), conversation_id="conv_1"):
        frames.append(frame)

    joined = "".join(frames)
    assert '"type": "data-tool-call"' in joined
    assert '"toolCallId": "call_1"' in joined
    assert '"name": "web_search"' in joined
    assert '"type": "data-tool-result"' in joined
    assert '\\"results\\": []' in joined
    assert '"delta": "Final answer"' in joined


@pytest.mark.anyio
async def test_usechat_stream_from_langgraph_emits_reasoning_parts_from_values():
    async def upstream():
        yield (
            'event: values\n'
            'data: {"messages":[{"type":"human","content":"Hi","id":"human_1"},{"type":"ai","id":"ai_1","content":"","additional_kwargs":{"reasoning_content":"Need to inspect the request"}}]}\n\n'
        )
        yield 'event: messages-tuple\ndata: {"type":"ai","content":"Final answer","id":"ai_1"}\n\n'

    frames = []
    async for frame in usechat_stream_from_langgraph(upstream(), conversation_id="conv_1"):
        frames.append(frame)

    joined = "".join(frames)
    assert '"type": "data-reasoning"' in joined
    assert '"messageId": "ai_1"' in joined
    assert '"content": "Need to inspect the request"' in joined
    assert '"delta": "Final answer"' in joined
