import httpx
import time

import app.api.routes.conversations as conversations_routes
from app.clients.deerflow import DeerFlowClient
from app.core.config import Settings


def _patch_default_stream_settings(monkeypatch) -> None:
    monkeypatch.setattr(
        conversations_routes,
        "get_settings",
        lambda: Settings(
            database_url="sqlite:///./test.db",
            bff_secret_key="test-secret",
            deerflow_gateway_base_url="http://127.0.0.1:8001",
        ),
        raising=False,
    )

from app.services.conversation_service import ConversationService

WEATHER_PROMPT = "请查询上海明天的天气，并给我一句穿衣建议。"


def test_stream_route_requires_auth(client) -> None:
    response = client.post(
        "/conversations/test-conversation/messages/stream",
        json={"message": WEATHER_PROMPT},
    )

    assert response.status_code == 401


def test_stream_route_rejects_unowned_conversation(client) -> None:
    login = client.post("/auth/login", json={"username": "demo", "password": "demo1234"})
    token = login.json()["access_token"]

    response = client.post(
        "/conversations/missing/messages/stream",
        json={"message": "hello"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 404


def test_stream_route_returns_sse_for_owned_conversation(client, db_session, monkeypatch) -> None:
    _patch_default_stream_settings(monkeypatch)
    class FakeResponse:
        async def aiter_lines(self):
            for line in [
                "event: messages",
                'data: [{"type":"ai","id":"ai-tool-call","content":"","tool_calls":[{"id":"tool-1","name":"web_search","args":{"query":"上海 明天天气"}}]},{"langgraph_node":"agent"}]',
                "",
                "event: messages",
                'data: [{"type":"tool","id":"tool-message-1","tool_call_id":"tool-1","content":"找到上海天气预报"} ,{"langgraph_node":"tools"}]',
                "",
                "event: values",
                'data: {"title":"Shanghai Weather Advice","messages":[{"type":"human","id":"h-1","content":"请查询上海明天的天气，并给我一句穿衣建议。"},{"type":"ai","id":"ai-tool-call","content":"上海明天多云转小雨，气温约18到24摄氏度，建议带一件轻薄外套。"}],"artifacts":[]}',
                "",
                "event: end",
                "data: {}",
            ]:
                yield line

        async def aclose(self) -> None:
            return None

    class FakeClient:
        async def aclose(self) -> None:
            return None

    async def mock_stream_message(self, thread_id: str, message: str, context=None, config=None):
        assert message == WEATHER_PROMPT
        assert context == {"user_id": me.json()["id"]}
        assert config is None
        return FakeClient(), FakeResponse()

    async def mock_get_thread_history(self, thread_id: str, limit: int = 1) -> list[dict]:
        assert thread_id == "thread-owned"
        assert limit == 1
        return []

    monkeypatch.setattr(DeerFlowClient, "stream_message", mock_stream_message)
    monkeypatch.setattr(DeerFlowClient, "get_thread_history", mock_get_thread_history)

    login = client.post("/auth/login", json={"username": "demo", "password": "demo1234"})
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    me = client.get("/me", headers=headers)
    conversation = ConversationService(db_session).create_conversation(
        user_id=me.json()["id"],
        deerflow_thread_id="thread-owned",
    )

    response = client.post(
        f"/conversations/{conversation.id}/messages/stream",
        json={"message": WEATHER_PROMPT},
        headers=headers,
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert b"event: message.started" in response.content
    assert b"event: tool.started" in response.content
    assert b"event: tool.progress" in response.content
    assert b"event: tool.completed" not in response.content
    assert b"event: message.delta" in response.content
    assert b"event: message.completed" in response.content


def test_stream_route_syncs_conversation_title_after_stream(client, db_session, monkeypatch) -> None:
    _patch_default_stream_settings(monkeypatch)
    class FakeResponse:
        async def aiter_lines(self):
            for line in [
                "event: values",
                'data: {"title":"Synced conversation","messages":[{"type":"human","id":"h-1","content":"hello"},{"type":"ai","id":"ai-1","content":"Hi there"}],"artifacts":[],"todos":[]}',
                "",
                "event: end",
                "data: {}",
            ]:
                yield line

        async def aclose(self) -> None:
            return None

    class FakeClient:
        async def aclose(self) -> None:
            return None

    async def mock_stream_message(self, thread_id: str, message: str, context=None, config=None):
        assert config is None
        return FakeClient(), FakeResponse()

    async def mock_get_thread_history(self, thread_id: str, limit: int = 1) -> list[dict]:
        assert thread_id == "thread-owned"
        assert limit == 1
        return [
            {
                "checkpoint_id": "checkpoint-1",
                "values": {
                    "title": "Synced conversation",
                    "messages": [
                        {"type": "human", "id": "h-1", "content": "hello"},
                        {"type": "ai", "id": "ai-1", "content": "Hi there"},
                    ],
                    "artifacts": [],
                    "todos": [],
                },
                "created_at": "2026-04-10T00:00:00Z",
                "next": [],
            }
        ]

    monkeypatch.setattr(DeerFlowClient, "stream_message", mock_stream_message)
    monkeypatch.setattr(DeerFlowClient, "get_thread_history", mock_get_thread_history)

    login = client.post("/auth/login", json={"username": "demo", "password": "demo1234"})
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    me = client.get("/me", headers=headers)
    conversation = ConversationService(db_session).create_conversation(
        user_id=me.json()["id"],
        deerflow_thread_id="thread-owned",
    )

    response = client.post(
        f"/conversations/{conversation.id}/messages/stream",
        json={"message": WEATHER_PROMPT},
        headers=headers,
    )

    assert response.status_code == 200

    listed = None
    detail = None
    for _ in range(20):
        listed = client.get("/conversations", headers=headers)
        detail = client.get(f"/conversations/{conversation.id}", headers=headers)
        if (
            listed.status_code == 200
            and listed.json()[0]["title"] == "Synced conversation"
            and detail.status_code == 200
            and detail.json()["title"] == "Synced conversation"
        ):
            break
        time.sleep(0.01)

    assert listed is not None
    assert detail is not None
    assert listed.status_code == 200
    assert listed.json()[0]["title"] == "Synced conversation"
    assert detail.status_code == 200
    assert detail.json()["title"] == "Synced conversation"


def test_stream_route_keeps_sse_response_when_post_stream_sync_fails(client, db_session, monkeypatch) -> None:
    _patch_default_stream_settings(monkeypatch)
    class FakeResponse:
        async def aiter_lines(self):
            for line in [
                "event: values",
                'data: {"messages":[{"type":"human","id":"h-1","content":"hello"},{"type":"ai","id":"ai-1","content":"Hi there"}],"artifacts":[],"todos":[]}',
                "",
                "event: end",
                "data: {}",
            ]:
                yield line

        async def aclose(self) -> None:
            return None

    class FakeClient:
        async def aclose(self) -> None:
            return None

    async def mock_stream_message(self, thread_id: str, message: str, context=None, config=None):
        assert config is None
        return FakeClient(), FakeResponse()

    async def mock_get_thread_history(self, thread_id: str, limit: int = 1) -> list[dict]:
        raise httpx.ConnectError("history unavailable")

    monkeypatch.setattr(DeerFlowClient, "stream_message", mock_stream_message)
    monkeypatch.setattr(DeerFlowClient, "get_thread_history", mock_get_thread_history)

    login = client.post("/auth/login", json={"username": "demo", "password": "demo1234"})
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    me = client.get("/me", headers=headers)
    conversation = ConversationService(db_session).create_conversation(
        user_id=me.json()["id"],
        deerflow_thread_id="thread-owned",
    )

    response = client.post(
        f"/conversations/{conversation.id}/messages/stream",
        json={"message": "hello"},
        headers=headers,
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert b"event: message.started" in response.content
    assert b"event: message.delta" in response.content
    assert b"event: message.completed" in response.content


def test_stream_route_forwards_model_context_to_deerflow(client, db_session, monkeypatch) -> None:
    _patch_default_stream_settings(monkeypatch)
    class FakeResponse:
        async def aiter_lines(self):
            for line in [
                "event: end",
                "data: {}",
            ]:
                yield line

        async def aclose(self) -> None:
            return None

    class FakeClient:
        async def aclose(self) -> None:
            return None

    captured = {}

    async def mock_stream_message(self, thread_id: str, message: str, context=None, config=None):
        captured["thread_id"] = thread_id
        captured["message"] = message
        captured["context"] = context
        captured["config"] = config
        return FakeClient(), FakeResponse()

    async def mock_get_thread_history(self, thread_id: str, limit: int = 1) -> list[dict]:
        return []

    monkeypatch.setattr(DeerFlowClient, "stream_message", mock_stream_message)
    monkeypatch.setattr(DeerFlowClient, "get_thread_history", mock_get_thread_history)

    login = client.post("/auth/login", json={"username": "demo", "password": "demo1234"})
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    me = client.get("/me", headers=headers)
    conversation = ConversationService(db_session).create_conversation(
        user_id=me.json()["id"],
        deerflow_thread_id="thread-owned",
    )

    response = client.post(
        f"/conversations/{conversation.id}/messages/stream",
        json={
            "message": "hello",
            "model_name": "deepseek-v3",
            "thinking_enabled": True,
            "reasoning_effort": "high",
        },
        headers=headers,
    )

    assert response.status_code == 200
    assert captured["thread_id"] == "thread-owned"
    assert captured["message"] == "hello"
    assert captured["context"] == {
        "user_id": me.json()["id"],
        "model_name": "deepseek-v3",
        "thinking_enabled": True,
        "reasoning_effort": "high",
    }
    assert captured["config"] is None

