from app.clients.deerflow import DeerFlowClient
from app.services.conversation_service import ConversationService

WEATHER_PROMPT = "请查询上海明天的天气，并给我一句穿衣建议。"


def test_stream_route_requires_auth(client) -> None:
    response = client.post(
        "/conversations/test-conversation/messages/stream",
        json={"message": WEATHER_PROMPT},
    )

    assert response.status_code == 401


def test_stream_route_rejects_unowned_conversation(client) -> None:
    login = client.post("/auth/login", json={"username": "demo", "password": "demo123"})
    token = login.json()["access_token"]

    response = client.post(
        "/conversations/missing/messages/stream",
        json={"message": "hello"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 404


def test_stream_route_returns_sse_for_owned_conversation(client, db_session, monkeypatch) -> None:
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

    async def mock_stream_message(self, thread_id: str, message: str):
        assert message == WEATHER_PROMPT
        return FakeClient(), FakeResponse()

    monkeypatch.setattr(DeerFlowClient, "stream_message", mock_stream_message)

    login = client.post("/auth/login", json={"username": "demo", "password": "demo123"})
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
    assert b"event: tool.completed" in response.content
    assert b"event: message.delta" in response.content
    assert b"event: message.completed" in response.content


def test_stream_route_syncs_conversation_title_after_stream(client, db_session, monkeypatch) -> None:
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

    async def mock_stream_message(self, thread_id: str, message: str):
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

    login = client.post("/auth/login", json={"username": "demo", "password": "demo123"})
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

    listed = client.get("/conversations", headers=headers)
    detail = client.get(f"/conversations/{conversation.id}", headers=headers)

    assert listed.status_code == 200
    assert listed.json()[0]["title"] == "Synced conversation"
    assert detail.status_code == 200
    assert detail.json()["title"] == "Synced conversation"
