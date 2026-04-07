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
async def test_usechat_stream_from_langgraph_converts_snapshot_text_to_incremental_delta():
    async def upstream():
        yield 'event: messages\ndata: [{"id":"ai-1","content":"Hello","type":"AIMessageChunk"},{"langgraph_node":"agent"}]\n\n'
        yield 'event: messages\ndata: [{"id":"ai-1","content":"Hello world","type":"AIMessageChunk"},{"langgraph_node":"agent"}]\n\n'

    frames = []
    async for frame in usechat_stream_from_langgraph(upstream(), conversation_id="conv_1"):
        frames.append(frame)

    joined = "".join(frames)
    assert '"delta": "Hello"' in joined
    assert '"delta": " world"' in joined
    assert '"delta": "Hello world"' not in joined


@pytest.mark.anyio
async def test_usechat_stream_from_langgraph_ignores_non_ai_text_markers():
    async def upstream():
        yield 'event: messages\ndata: {"type":"status","text":"2/2"}\n\n'
        yield 'event: messages\ndata: [{"id":"ai-1","content":"Final answer","type":"AIMessageChunk"},{"langgraph_node":"agent"}]\n\n'

    frames = []
    async for frame in usechat_stream_from_langgraph(upstream(), conversation_id="conv_1"):
        frames.append(frame)

    joined = "".join(frames)
    assert '"delta": "2/2"' not in joined
    assert '"delta": "Final answer"' in joined


@pytest.mark.anyio
async def test_usechat_stream_from_langgraph_deduplicates_repeated_text_from_multiple_event_types():
    async def upstream():
        yield 'event: messages-tuple\ndata: {"type":"ai","content":"Hello","id":"ai_1"}\n\n'
        yield 'event: messages\ndata: [{"id":"ai_1","content":"Hello","type":"AIMessageChunk"},{"langgraph_node":"agent"}]\n\n'

    frames = []
    async for frame in usechat_stream_from_langgraph(upstream(), conversation_id="conv_1"):
        frames.append(frame)

    joined = "".join(frames)
    assert joined.count('"type": "text-delta"') == 1
    assert joined.count('"delta": "Hello"') == 1


@pytest.mark.anyio
async def test_usechat_stream_from_langgraph_deduplicates_repeated_tool_events_from_snapshots():
    async def upstream():
        yield (
            'event: messages\n'
            'data: [{"type":"ai","id":"ai_1","content":"","tool_calls":[{"id":"call_1","name":"web_search","args":{"query":"深圳天气"}}]},{"langgraph_node":"agent"}]\n\n'
        )
        yield (
            'event: messages\n'
            'data: [{"type":"ai","id":"ai_1","content":"","tool_calls":[{"id":"call_1","name":"web_search","args":{"query":"深圳天气"}}]},{"langgraph_node":"agent"}]\n\n'
        )
        yield (
            'event: messages\n'
            'data: [{"type":"tool","id":"tool_1","name":"web_search","tool_call_id":"call_1","content":"{\\"results\\":[{\\"title\\":\\"深圳天气预报\\"}]}"},{"langgraph_node":"tools"}]\n\n'
        )
        yield (
            'event: messages\n'
            'data: [{"type":"tool","id":"tool_1","name":"web_search","tool_call_id":"call_1","content":"{\\"results\\":[{\\"title\\":\\"深圳天气预报\\"}]}"},{"langgraph_node":"tools"}]\n\n'
        )

    frames = []
    async for frame in usechat_stream_from_langgraph(upstream(), conversation_id="conv_1"):
        frames.append(frame)

    joined = "".join(frames)
    assert joined.count('"type": "data-tool-call"') == 1
    assert joined.count('"type": "data-tool-result"') == 1


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
async def test_usechat_stream_from_langgraph_serializes_object_tool_results():
    async def upstream():
        yield (
            "event: messages-tuple\n"
            'data: {"type":"ai","content":"","id":"ai_1","tool_calls":[{"name":"web_search","args":{"query":"北京天气"},"id":"call_1"}]}\n\n'
        )
        yield (
            "event: messages-tuple\n"
            'data: {"type":"tool","content":{"results":[{"title":"北京天气预报"}]},"name":"web_search","tool_call_id":"call_1","id":"tool_1"}\n\n'
        )

    frames = []
    async for frame in usechat_stream_from_langgraph(upstream(), conversation_id="conv_1"):
        frames.append(frame)

    joined = "".join(frames)
    assert '"type": "data-tool-result"' in joined
    assert '"toolCallId": "call_1"' in joined
    assert '\\"title\\": \\"北京天气预报\\"' in joined


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


@pytest.mark.anyio
async def test_usechat_stream_from_langgraph_accumulates_reasoning_deltas_for_same_message():
    async def upstream():
        yield (
            'event: messages-tuple\n'
            'data: {"type":"ai","id":"ai_1","content":[{"type":"text","thinking":"先分析一下"}]}\n\n'
        )
        yield (
            'event: messages-tuple\n'
            'data: {"type":"ai","id":"ai_1","content":[{"type":"text","thinking":"，再去搜索"}]}\n\n'
        )

    frames = []
    async for frame in usechat_stream_from_langgraph(upstream(), conversation_id="conv_1"):
        frames.append(frame)

    joined = "".join(frames)
    assert '"type": "data-reasoning"' in joined
    assert '"content": "先分析一下，再去搜索"' in joined


@pytest.mark.anyio
async def test_usechat_stream_from_langgraph_emits_tool_results_from_values_events():
    async def upstream():
        yield (
            'event: values\n'
            'data: {"messages":['
            '{"type":"ai","id":"ai_1","content":"","tool_calls":[{"id":"call_1","name":"web_search","args":{"query":"深圳天气"}}]},'
            '{"type":"tool","id":"tool_1","name":"web_search","tool_call_id":"call_1","content":{"results":[{"title":"深圳天气预报"}]}}'
            ']}\n\n'
        )

    frames = []
    async for frame in usechat_stream_from_langgraph(upstream(), conversation_id="conv_1"):
        frames.append(frame)

    joined = "".join(frames)
    assert '"type": "data-tool-call"' in joined
    assert '"type": "data-tool-result"' in joined
    assert '\\"title\\": \\"深圳天气预报\\"' in joined


@pytest.mark.anyio
async def test_usechat_stream_from_langgraph_emits_tool_call_before_tool_result_from_values_events():
    async def upstream():
        yield (
            'event: values\n'
            'data: {"messages":['
            '{"type":"tool","id":"tool_1","name":"web_search","tool_call_id":"call_1","content":{"results":[{"title":"深圳天气预报"}]}},'
            '{"type":"ai","id":"ai_1","content":"","tool_calls":[{"id":"call_1","name":"web_search","args":{"query":"深圳天气"}}]}'
            ']}\n\n'
        )

    frames = []
    async for frame in usechat_stream_from_langgraph(upstream(), conversation_id="conv_1"):
        frames.append(frame)

    joined = "".join(frames)
    assert joined.index('"type": "data-tool-call"') < joined.index('"type": "data-tool-result"')


@pytest.mark.anyio
async def test_usechat_stream_from_langgraph_ignores_replayed_tool_call_after_value_result():
    async def upstream():
        yield (
            'event: values\n'
            'data: {"messages":['
            '{"type":"ai","id":"ai_1","content":"","tool_calls":[{"id":"call_1","name":"web_search","args":{"query":"成都明天天气"}}]},'
            '{"type":"tool","id":"tool_1","name":"web_search","tool_call_id":"call_1","content":{"results":[{"title":"成都天气预报"}]}}'
            ']}\n\n'
        )
        yield (
            'event: messages\n'
            'data: [{"type":"ai","id":"ai_2","content":"","tool_calls":[{"id":"call_1","name":"web_search","args":{"query":"成都明天天气"}}]},{"langgraph_node":"agent"}]\n\n'
        )

    frames = []
    async for frame in usechat_stream_from_langgraph(upstream(), conversation_id="conv_1"):
        frames.append(frame)

    joined = "".join(frames)
    assert joined.count('"type": "data-tool-call"') == 1
    assert joined.count('"type": "data-tool-result"') == 1


@pytest.mark.anyio
async def test_usechat_stream_from_langgraph_ignores_historical_message_events():
    async def upstream():
        yield (
            'event: values\n'
            'data: {"messages":['
            '{"type":"ai","id":"ai_old","content":"","tool_calls":[{"id":"call_old","name":"web_search","args":{"query":"旧天气"}}]},'
            '{"type":"tool","id":"tool_old","name":"web_search","tool_call_id":"call_old","content":{"results":[{"title":"旧结果"}]}}'
            ']}\n\n'
        )
        yield (
            'event: messages\n'
            'data: [{"type":"ai","id":"ai_old","content":"旧正文","tool_calls":[{"id":"call_old","name":"web_search","args":{"query":"旧天气"}}]},{"langgraph_node":"agent"}]\n\n'
        )
        yield (
            'event: messages\n'
            'data: [{"type":"tool","id":"tool_old","name":"web_search","tool_call_id":"call_old","content":{"results":[{"title":"旧结果"}]}},{"langgraph_node":"tools"}]\n\n'
        )
        yield (
            'event: messages\n'
            'data: [{"type":"ai","id":"ai_new","content":"","tool_calls":[{"id":"call_new","name":"web_search","args":{"query":"新天气"}}]},{"langgraph_node":"agent"}]\n\n'
        )
        yield (
            'event: messages\n'
            'data: [{"type":"tool","id":"tool_new","name":"web_search","tool_call_id":"call_new","content":{"results":[{"title":"新结果"}]}},{"langgraph_node":"tools"}]\n\n'
        )
        yield 'event: messages\ndata: [{"id":"ai_new","content":"新正文","type":"AIMessageChunk"},{"langgraph_node":"agent"}]\n\n'

    frames = []
    async for frame in usechat_stream_from_langgraph(
        upstream(),
        conversation_id="conv_1",
        historical_message_ids={"ai_old", "tool_old"},
    ):
        frames.append(frame)

    joined = "".join(frames)
    assert "旧正文" not in joined
    assert "旧结果" not in joined
    assert '"toolCallId": "call_old"' not in joined
    assert "新正文" in joined
    assert "新结果" in joined
    assert '"toolCallId": "call_new"' in joined
