import asyncio
from types import SimpleNamespace

from app.gateway.assistant_ui_adapter import convert_deerflow_messages_to_assistant_ui
from app.gateway.routers import assistant_ui
from app.gateway.routers.threads import ThreadStateResponse


def _override_current_user():
    class User:
        id = "user_a"

    return User()


def test_convert_deerflow_messages_to_assistant_ui_groups_assistant_turns():
    messages = [
        {"id": "u1", "type": "human", "content": "你好"},
        {
            "id": "a1",
            "type": "ai",
            "content": "",
            "additional_kwargs": {"reasoning_content": "先判断用户意图"},
            "tool_calls": [{"id": "call_1", "name": "web_search", "args": {"query": "上海天气"}}],
        },
        {
            "id": "tool_1",
            "type": "tool",
            "name": "web_search",
            "tool_call_id": "call_1",
            "content": '{"results":[{"title":"上海天气"}]}',
        },
        {"id": "a2", "type": "ai", "content": "上海明天多云。"},
    ]

    converted = convert_deerflow_messages_to_assistant_ui(messages)

    assert converted == [
        {
            "id": "u1",
            "role": "user",
            "parts": [{"type": "text", "text": "你好"}],
        },
        {
            "id": "a1",
            "role": "assistant",
            "parts": [
                {"type": "reasoning", "text": "先判断用户意图"},
                {
                    "type": "tool-call",
                    "toolCallId": "call_1",
                    "toolName": "web_search",
                    "args": {"query": "上海天气"},
                },
                {
                    "type": "tool-result",
                    "toolCallId": "call_1",
                    "toolName": "web_search",
                    "content": '{"results":[{"title":"上海天气"}]}',
                },
                {"type": "text", "text": "上海明天多云。"},
            ],
        },
    ]


def test_assistant_ui_thread_endpoint_returns_assistant_ui_messages(monkeypatch):
    async def fake_load_state(thread_id: str, request):
        assert thread_id == "thread_1"
        return ThreadStateResponse(
            values={
                "title": "Hello",
                "messages": [
                    {"id": "u1", "type": "human", "content": "你好"},
                    {
                        "id": "a1",
                        "type": "ai",
                        "content": "你好！",
                        "additional_kwargs": {"reasoning_content": "直接问候即可"},
                    },
                ],
                "artifacts": ["a.txt"],
                "todos": ["todo"],
            }
        )

    monkeypatch.setattr(assistant_ui.threads, "load_thread_state", fake_load_state)
    monkeypatch.setattr(
        assistant_ui.threads,
        "ensure_thread_belongs_to_user",
        lambda biz_thread_id, user_id: SimpleNamespace(id=biz_thread_id, user_id=user_id),
    )

    response = asyncio.run(
        assistant_ui.get_thread(
            "thread_1",
            request=SimpleNamespace(),
            user=_override_current_user(),
        )
    )

    assert response.model_dump() == {
        "thread_id": "thread_1",
        "title": "Hello",
        "messages": [
            {
                "id": "u1",
                "role": "user",
                "parts": [{"type": "text", "text": "你好"}],
            },
            {
                "id": "a1",
                "role": "assistant",
                "parts": [
                    {"type": "reasoning", "text": "直接问候即可"},
                    {"type": "text", "text": "你好！"},
                ],
            },
        ],
        "artifacts": ["a.txt"],
        "todos": ["todo"],
    }


def test_convert_deerflow_messages_to_assistant_ui_serializes_object_tool_result_content():
    messages = [
        {"id": "u1", "type": "human", "content": "北京天气"},
        {
            "id": "a1",
            "type": "ai",
            "content": "",
            "tool_calls": [{"id": "call_1", "name": "web_search", "args": {"query": "北京天气"}}],
        },
        {
            "id": "tool_1",
            "type": "tool",
            "name": "web_search",
            "tool_call_id": "call_1",
            "content": {"results": [{"title": "北京天气预报"}]},
        },
    ]

    converted = convert_deerflow_messages_to_assistant_ui(messages)
    tool_result = converted[1]["parts"][1]

    assert tool_result["type"] == "tool-result"
    assert tool_result["toolCallId"] == "call_1"
    assert '"title": "北京天气预报"' in tool_result["content"]


def test_assistant_ui_list_threads_falls_back_to_state_title(monkeypatch):
    async def fake_list_conversations(user):
        return [
            SimpleNamespace(
                conversation_id="thread_1",
                title="",
                created_at="1",
                updated_at="2",
            )
        ]

    async def fake_load_state(thread_id: str, request):
        assert thread_id == "thread_1"
        return ThreadStateResponse(
            values={
                "title": "Real Title",
                "messages": [{"id": "u1", "type": "human", "content": "你好"}],
            }
        )

    monkeypatch.setattr(assistant_ui.conversations, "list_conversations", fake_list_conversations)
    monkeypatch.setattr(assistant_ui.threads, "load_thread_state", fake_load_state)

    response = asyncio.run(
        assistant_ui.list_threads(
            request=SimpleNamespace(),
            user=_override_current_user(),
        )
    )

    assert [item.model_dump() for item in response] == [
        {
            "thread_id": "thread_1",
            "title": "Real Title",
            "created_at": "1",
            "updated_at": "2",
        }
    ]
