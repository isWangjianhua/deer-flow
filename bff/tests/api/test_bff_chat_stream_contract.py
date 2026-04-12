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
    assert len(tool_result) == 1
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


def test_stream_event_normalizer_emits_reasoning_from_values_snapshot():
    normalizer = StreamEventNormalizer()

    events = normalizer.normalize(
        "values",
        {
            "messages": [
                {"type": "human", "content": "hi", "id": "h-1"},
                {
                    "type": "ai",
                    "id": "ai-1",
                    "content": "Final answer",
                    "additional_kwargs": {
                        "reasoning_content": "First inspect the request."
                    },
                },
            ],
        },
    )

    assert events[0] == {
        "event": "message.started",
        "data": {"message_id": "ai-1"},
    }
    assert events[1] == {
        "event": "reasoning.delta",
        "data": {
            "message_id": "ai-1",
            "delta": "First inspect the request.",
        },
    }
    assert events[2] == {
        "event": "message.delta",
        "data": {
            "message_id": "ai-1",
            "delta": "Final answer",
        },
    }


def test_stream_event_normalizer_strips_repeated_reasoning_prefixes_from_values_snapshot():
    normalizer = StreamEventNormalizer()

    first_reasoning = "A"
    second_reasoning = "B"
    third_reasoning = "C"

    normalizer.normalize(
        "messages",
        [
            {
                "type": "ai",
                "id": "ai-1",
                "content": "",
                "additional_kwargs": {
                    "reasoning_content": first_reasoning,
                },
                "tool_calls": [
                    {
                        "id": "tool-1",
                        "name": "web_search",
                        "args": {"query": "weather"},
                    }
                ],
            },
            {"langgraph_node": "agent"},
        ],
    )
    normalizer.normalize(
        "messages",
        [
            {
                "type": "AIMessageChunk",
                "id": "ai-1",
                "content": "",
                "additional_kwargs": {
                    "reasoning_content": f"{first_reasoning}{second_reasoning}",
                },
            },
            {"langgraph_node": "agent"},
        ],
    )

    events = normalizer.normalize(
        "values",
        {
            "messages": [
                {"type": "human", "id": "h-1", "content": "hi"},
                {
                    "type": "ai",
                    "id": "ai-1",
                    "content": "",
                    "additional_kwargs": {
                        "reasoning_content": f"{first_reasoning}{second_reasoning}{first_reasoning}{second_reasoning}{third_reasoning}"
                    },
                },
            ],
        },
    )

    assert events == [
        {
            "event": "reasoning.delta",
            "data": {
                "message_id": "ai-1",
                "delta": third_reasoning,
            },
        }
    ]


def test_stream_event_normalizer_ignores_repeated_historical_reasoning_steps_in_message_chunks():
    normalizer = StreamEventNormalizer()

    first_reasoning = "A"
    second_reasoning = "B"
    third_reasoning = "C"

    first = normalizer.normalize(
        "messages",
        [
            {
                "type": "ai",
                "id": "ai-1",
                "content": "",
                "additional_kwargs": {
                    "reasoning_content": first_reasoning,
                },
                "tool_calls": [
                    {
                        "id": "tool-1",
                        "name": "web_search",
                        "args": {"query": "weather"},
                    }
                ],
            },
            {"langgraph_node": "agent"},
        ],
    )
    second = normalizer.normalize(
        "messages",
        [
            {
                "type": "AIMessageChunk",
                "id": "ai-1",
                "content": "",
                "additional_kwargs": {
                    "reasoning_content": second_reasoning,
                },
            },
            {"langgraph_node": "agent"},
        ],
    )
    third = normalizer.normalize(
        "messages",
        [
            {
                "type": "ai",
                "id": "ai-1",
                "content": "",
                "tool_calls": [
                    {
                        "id": "tool-2",
                        "name": "web_fetch",
                        "args": {"url": "https://example.com"},
                    }
                ],
            },
            {"langgraph_node": "agent"},
        ],
    )
    repeated_first = normalizer.normalize(
        "messages",
        [
            {
                "type": "AIMessageChunk",
                "id": "ai-1",
                "content": "",
                "additional_kwargs": {
                    "reasoning_content": first_reasoning,
                },
            },
            {"langgraph_node": "agent"},
        ],
    )
    repeated_second = normalizer.normalize(
        "messages",
        [
            {
                "type": "AIMessageChunk",
                "id": "ai-1",
                "content": "",
                "additional_kwargs": {
                    "reasoning_content": second_reasoning,
                },
            },
            {"langgraph_node": "agent"},
        ],
    )
    new_reasoning = normalizer.normalize(
        "messages",
        [
            {
                "type": "AIMessageChunk",
                "id": "ai-1",
                "content": "",
                "additional_kwargs": {
                    "reasoning_content": third_reasoning,
                },
            },
            {"langgraph_node": "agent"},
        ],
    )

    assert first[0] == {
        "event": "message.started",
        "data": {"message_id": "ai-1"},
    }
    assert first[1] == {
        "event": "reasoning.delta",
        "data": {"message_id": "ai-1", "delta": first_reasoning},
    }
    assert second == [
        {
            "event": "reasoning.delta",
            "data": {"message_id": "ai-1", "delta": second_reasoning},
        }
    ]
    assert third == [
        {
            "event": "tool.started",
            "data": {
                "tool_call_id": "tool-2",
                "label": "web_fetch",
                "name": "web_fetch",
                "args": {"url": "https://example.com"},
            },
        }
    ]
    assert repeated_first == []
    assert repeated_second == []
    assert new_reasoning == [
        {
            "event": "reasoning.delta",
            "data": {"message_id": "ai-1", "delta": third_reasoning},
        }
    ]


def test_stream_event_normalizer_reemits_tool_started_when_values_snapshot_has_richer_args():
    normalizer = StreamEventNormalizer()

    first = normalizer.normalize(
        "messages",
        [
            {
                "type": "ai",
                "id": "ai-1",
                "content": "",
                "tool_calls": [
                    {
                        "id": "tool-1",
                        "name": "web_search",
                        "args": {},
                    }
                ],
            },
            {"langgraph_node": "agent"},
        ],
    )

    enriched = normalizer.normalize(
        "values",
        {
            "messages": [
                {"type": "human", "id": "h-1", "content": "hi"},
                {
                    "type": "ai",
                    "id": "ai-1",
                    "content": "",
                    "tool_calls": [
                        {
                            "id": "tool-1",
                            "name": "web_search",
                            "args": {"query": "上海 4 月 13 日 天气"},
                        }
                    ],
                },
            ]
        },
    )

    assert first == [
        {
            "event": "message.started",
            "data": {"message_id": "ai-1"},
        },
        {
            "event": "tool.started",
            "data": {
                "tool_call_id": "tool-1",
                "label": "web_search",
                "name": "web_search",
                "args": {},
            },
        },
    ]
    assert enriched == [
        {
            "event": "tool.started",
            "data": {
                "tool_call_id": "tool-1",
                "label": "web_search",
                "name": "web_search",
                "args": {"query": "上海 4 月 13 日 天气"},
            },
        }
    ]


def test_stream_event_normalizer_deduplicates_tool_progress_replayed_by_values_snapshot():
    normalizer = StreamEventNormalizer()

    normalizer.normalize(
        "messages",
        [
            {
                "type": "ai",
                "id": "ai-1",
                "content": "",
                "tool_calls": [
                    {
                        "id": "tool-1",
                        "name": "web_search",
                        "args": {"query": "weather"},
                    }
                ],
            },
            {"langgraph_node": "agent"},
        ],
    )
    first_progress = normalizer.normalize(
        "messages",
        [
            {
                "type": "tool",
                "id": "tool-message-1",
                "tool_call_id": "tool-1",
                "content": "Found forecast",
            },
            {"langgraph_node": "tools"},
        ],
    )
    replayed_in_values = normalizer.normalize(
        "values",
        {
            "messages": [
                {"type": "human", "id": "h-1", "content": "hi"},
                {
                    "type": "ai",
                    "id": "ai-1",
                    "content": "",
                    "tool_calls": [
                        {
                            "id": "tool-1",
                            "name": "web_search",
                            "args": {"query": "weather"},
                        }
                    ],
                },
                {
                    "type": "tool",
                    "id": "tool-message-1",
                    "tool_call_id": "tool-1",
                    "content": "Found forecast",
                },
            ]
        },
    )

    assert first_progress == [
        {
            "event": "tool.progress",
            "data": {"tool_call_id": "tool-1", "message": "Found forecast"},
        }
    ]
    assert replayed_in_values == [
        {
            "event": "tool.completed",
            "data": {"tool_call_id": "tool-1"},
        }
    ]


def test_stream_event_normalizer_keeps_true_reasoning_extensions_from_values_snapshot():
    normalizer = StreamEventNormalizer()

    normalizer.normalize(
        "messages",
        [
            {
                "type": "AIMessageChunk",
                "id": "ai-1",
                "content": "",
                "additional_kwargs": {
                    "reasoning_content": "A",
                },
            },
            {"langgraph_node": "agent"},
        ],
    )

    events = normalizer.normalize(
        "values",
        {
            "messages": [
                {"type": "human", "id": "h-1", "content": "hi"},
                {
                    "type": "ai",
                    "id": "ai-1",
                    "content": "",
                    "additional_kwargs": {
                        "reasoning_content": "AB",
                    },
                },
            ],
        },
    )

    assert events == [
        {
            "event": "reasoning.delta",
            "data": {
                "message_id": "ai-1",
                "delta": "B",
            },
        }
    ]


def test_stream_event_normalizer_emits_reasoning_from_message_chunks():
    normalizer = StreamEventNormalizer()

    events = normalizer.normalize(
        "messages",
        [
            {
                "type": "AIMessageChunk",
                "id": "ai-1",
                "content": "",
                "additional_kwargs": {
                    "reasoning_content": "Thinking step 1.",
                },
            },
            {"langgraph_node": "agent"},
        ],
    )

    assert events[0] == {
        "event": "message.started",
        "data": {"message_id": "ai-1"},
    }
    assert events[1] == {
        "event": "reasoning.delta",
        "data": {
            "message_id": "ai-1",
            "delta": "Thinking step 1.",
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


def test_stream_event_normalizer_maps_gateway_error_to_run_failed() -> None:
    normalizer = StreamEventNormalizer()

    events = normalizer.normalize(
        "error",
        {"message": "boom", "name": "ValueError"},
    )

    assert events == [
        {
            "event": "run.failed",
            "data": {"message": "boom", "name": "ValueError"},
        }
    ]


def test_stream_event_normalizer_does_not_complete_message_after_error() -> None:
    normalizer = StreamEventNormalizer()

    started = normalizer.normalize(
        "messages",
        [
            {
                "type": "AIMessageChunk",
                "id": "ai-1",
                "content": "partial",
            },
            {"langgraph_node": "agent"},
        ],
    )
    failed = normalizer.normalize(
        "error",
        {"message": "boom", "name": "ValueError"},
    )
    completed = normalizer.normalize("end", {})

    assert started[0] == {
        "event": "message.started",
        "data": {"message_id": "ai-1"},
    }
    assert failed == [
        {
            "event": "run.failed",
            "data": {"message": "boom", "name": "ValueError"},
        }
    ]
    assert completed == []


def test_stream_event_normalizer_does_not_complete_tool_for_each_chunk() -> None:
    normalizer = StreamEventNormalizer()

    normalizer.normalize(
        "messages",
        [
            {
                "type": "ai",
                "id": "ai-1",
                "content": "",
                "tool_calls": [
                    {
                        "id": "tool-1",
                        "name": "web_search",
                        "args": {"query": "weather"},
                    }
                ],
            },
            {"langgraph_node": "agent"},
        ],
    )

    first = normalizer.normalize(
        "messages",
        [
            {
                "type": "ToolMessageChunk",
                "id": "tool-message-1",
                "tool_call_id": "tool-1",
                "content": "Looking up forecast",
            },
            {"langgraph_node": "tools"},
        ],
    )
    second = normalizer.normalize(
        "messages",
        [
            {
                "type": "ToolMessageChunk",
                "id": "tool-message-2",
                "tool_call_id": "tool-1",
                "content": "Checking hourly data",
            },
            {"langgraph_node": "tools"},
        ],
    )

    assert first == [
        {
            "event": "tool.progress",
            "data": {"tool_call_id": "tool-1", "message": "Looking up forecast"},
        }
    ]
    assert second == [
        {
            "event": "tool.progress",
            "data": {"tool_call_id": "tool-1", "message": "Checking hourly data"},
        }
    ]
