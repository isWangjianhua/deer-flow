from app.clients.deerflow import DeerFlowClient
from app.services.conversation_service import ConversationService


def test_stream_route_requires_auth(client) -> None:
    response = client.post(
        "/conversations/test-conversation/messages/stream",
        json={"message": "hello"},
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
            for line in ["event: message", 'data: {"content":"hi"}']:
                yield line

        async def aclose(self) -> None:
            return None

    class FakeClient:
        async def aclose(self) -> None:
            return None

    async def mock_stream_message(self, thread_id: str, message: str):
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
        json={"message": "hello"},
        headers=headers,
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
