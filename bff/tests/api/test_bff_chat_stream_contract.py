from app.sse.proxy import normalize_stream_event


def test_normalize_stream_event_maps_tool_and_message_events():
    assert normalize_stream_event(
        {
            "event": "tool_start",
            "data": {"tool_call_id": "tool-1", "label": "Searching web"},
        }
    ) == {
        "event": "tool.started",
        "data": {"tool_call_id": "tool-1", "label": "Searching web"},
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
