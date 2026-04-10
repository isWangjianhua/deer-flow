from app.sse.proxy import StreamEventNormalizer, normalize_stream_event


def test_normalize_stream_event_maps_tool_and_message_events():
    assert normalize_stream_event(
        {
            "event": "tool_start",
            "data": {
                "tool_call_id": "tool-1",
                "label": "Searching web",
                "name": "web_search",
                "args": {"query": "weather"},
            },
        }
    ) == {
        "event": "tool.started",
        "data": {
            "tool_call_id": "tool-1",
            "label": "Searching web",
            "name": "web_search",
            "args": {"query": "weather"},
        },
    }

    assert normalize_stream_event(
        {
            "event": "message_delta",
            "data": {"message_id": "assistant-1", "delta": "Hello"},
        }
    ) == {
        "event": "message.delta",
        "data": {"message_id": "assistant-1", "delta": "Hello"},
    }


def test_stream_event_normalizer_maps_messages_sequence_to_frontend_events():
    normalizer = StreamEventNormalizer()

    started = normalizer.normalize(
        "messages",
        [
            {
                "type": "ai",
                "id": "ai-tool-call",
                "content": "",
                "tool_calls": [
                    {
                        "id": "tool-1",
                        "name": "web_search",
                        "args": {"query": "LangGraph"},
                    }
                ],
            },
            {"langgraph_node": "agent"},
        ],
    )
    tool_result = normalizer.normalize(
        "messages",
        [
            {
                "type": "tool",
                "id": "tool-message-1",
                "tool_call_id": "tool-1",
                "content": "Found LangGraph docs",
            },
            {"langgraph_node": "tools"},
        ],
    )
    final_text = normalizer.normalize(
        "messages",
        [
            {
                "type": "AIMessageChunk",
                "id": "ai-tool-call",
                "content": "LangGraph is a framework for agent workflows.",
            },
            {"langgraph_node": "agent"},
        ],
    )
    completed = normalizer.normalize("end", {})

    assert started[0] == {
        "event": "message.started",
        "data": {"message_id": "ai-tool-call"},
    }
    assert started[1] == {
        "event": "tool.started",
        "data": {
            "tool_call_id": "tool-1",
            "label": "web_search",
            "name": "web_search",
            "args": {"query": "LangGraph"},
        },
    }
    assert tool_result[0] == {
        "event": "tool.progress",
        "data": {"tool_call_id": "tool-1", "message": "Found LangGraph docs"},
    }
    assert tool_result[1] == {
        "event": "tool.completed",
        "data": {"tool_call_id": "tool-1"},
    }
    assert final_text[0] == {
        "event": "message.delta",
        "data": {
            "message_id": "ai-tool-call",
            "delta": "LangGraph is a framework for agent workflows.",
        },
    }
    assert completed[0] == {
        "event": "message.completed",
        "data": {"message_id": "ai-tool-call"},
    }


def test_stream_event_normalizer_reads_final_ai_text_from_values_snapshot():
    normalizer = StreamEventNormalizer()

    events = normalizer.normalize(
        "values",
        {
            "title": "Greeting",
            "messages": [
                {"type": "human", "content": "hi", "id": "h-1"},
                {
                    "type": "ai",
                    "id": "ai-1",
                    "content": "Hello from values snapshot",
                },
            ],
        },
    )

    assert events[0] == {
        "event": "message.started",
        "data": {"message_id": "ai-1"},
    }
    assert events[1] == {
        "event": "message.delta",
        "data": {
            "message_id": "ai-1",
            "delta": "Hello from values snapshot",
        },
    }


def test_stream_event_normalizer_ignores_previous_turn_history_in_values_snapshot():
    normalizer = StreamEventNormalizer()

    events = normalizer.normalize(
        "values",
        {
            "messages": [
                {"type": "human", "id": "h-1", "content": "first"},
                {"type": "ai", "id": "ai-1", "content": "First answer"},
                {"type": "human", "id": "h-2", "content": "second"},
                {"type": "ai", "id": "ai-2", "content": "Second answer"},
            ]
        },
    )

    assert events[0] == {
        "event": "message.started",
        "data": {"message_id": "ai-2"},
    }
    assert events[1] == {
        "event": "message.delta",
        "data": {"message_id": "ai-2", "delta": "Second answer"},
    }


def test_stream_event_normalizer_ignores_title_generation_chunks() -> None:
    normalizer = StreamEventNormalizer()

    response_events = normalizer.normalize(
        "messages",
        [
            {
                "type": "AIMessageChunk",
                "id": "ai-1",
                "content": "Final answer",
            },
            {"langgraph_node": "model"},
        ],
    )
    title_events = normalizer.normalize(
        "messages",
        [
            {
                "type": "AIMessageChunk",
                "id": "title-1",
                "content": "Final Answer Conversation",
            },
            {"langgraph_node": "TitleMiddleware.after_model"},
        ],
    )

    assert response_events[0] == {
        "event": "message.started",
        "data": {"message_id": "ai-1"},
    }
    assert response_events[1] == {
        "event": "message.delta",
        "data": {"message_id": "ai-1", "delta": "Final answer"},
    }
    assert title_events == []


def test_stream_event_normalizer_ignores_empty_tool_call_ids() -> None:
    normalizer = StreamEventNormalizer()

    events = normalizer.normalize(
        "messages",
        [
            {
                "type": "ai",
                "id": "ai-1",
                "content": "",
                "tool_calls": [
                    {"id": "", "name": "web_search", "args": {"query": "weather"}},
                    {"id": "tool-2", "name": "web_fetch", "args": {"url": "https://example.com"}},
                ],
            },
            {"langgraph_node": "agent"},
        ],
    )

    assert events == [
        {
            "event": "message.started",
            "data": {"message_id": "ai-1"},
        },
        {
            "event": "tool.started",
            "data": {
                "tool_call_id": "tool-2",
                "label": "web_fetch",
                "name": "web_fetch",
                "args": {"url": "https://example.com"},
            },
        },
    ]
