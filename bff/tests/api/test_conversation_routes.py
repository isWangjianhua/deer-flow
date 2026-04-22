from app.clients.deerflow import DeerFlowClient
from app.models.agent_ownership import AgentOwnership
from app.models.conversation import Conversation
from app.models.user import User
from app.services.conversation_service import ConversationService


def test_create_conversation_requires_auth(client) -> None:
    response = client.post("/conversations")

    assert response.status_code == 401


def test_create_and_list_conversations(client, monkeypatch) -> None:
    async def mock_create_thread(self) -> str:
        return "thread-123"

    monkeypatch.setattr(DeerFlowClient, "create_thread", mock_create_thread)

    login = client.post("/auth/login", json={"username": "demo", "password": "demo1234"})
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    created = client.post("/conversations", headers=headers)
    listed = client.get("/conversations", headers=headers)

    assert created.status_code == 200
    assert "id" in created.json()
    assert "agent_name" in created.json()
    assert created.json()["agent_name"] is None
    assert listed.status_code == 200
    assert len(listed.json()) == 1
    assert listed.json()[0]["id"] == created.json()["id"]
    assert "agent_name" in listed.json()[0]
    assert listed.json()[0]["agent_name"] is None


def test_get_conversation_detail(client, monkeypatch) -> None:
    async def mock_create_thread(self) -> str:
        return "thread-123"

    async def mock_get_thread_history(self, thread_id: str, limit: int = 1) -> list[dict]:
        assert thread_id == "thread-123"
        assert limit == 1
        return [
            {
                "checkpoint_id": "checkpoint-1",
                "values": {
                    "title": "Loaded conversation",
                    "messages": [
                        {
                            "id": "human-1",
                            "type": "human",
                            "content": [{"type": "text", "text": "Hello"}],
                            "additional_kwargs": {},
                        },
                        {
                            "id": "ai-1",
                            "type": "ai",
                            "content": "Hi there",
                            "additional_kwargs": {},
                            "tool_calls": [],
                            "invalid_tool_calls": [],
                        },
                    ],
                    "artifacts": [],
                    "todos": [],
                },
                "created_at": "2026-04-10T00:00:00Z",
                "next": [],
            }
        ]

    monkeypatch.setattr(DeerFlowClient, "create_thread", mock_create_thread)
    monkeypatch.setattr(DeerFlowClient, "get_thread_history", mock_get_thread_history)

    login = client.post("/auth/login", json={"username": "demo", "password": "demo1234"})
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    created = client.post("/conversations", headers=headers)
    detail = client.get(f"/conversations/{created.json()['id']}", headers=headers)

    assert detail.status_code == 200
    payload = detail.json()
    assert payload["id"] == created.json()["id"]
    assert payload["title"] == "Loaded conversation"
    assert payload["agent_name"] is None
    assert payload["values"]["title"] == "Loaded conversation"
    assert payload["values"]["messages"][0]["id"] == "human-1"


def test_get_conversation_detail_returns_agent_name(client, db_session, monkeypatch) -> None:
    async def mock_get_thread_history(self, thread_id: str, limit: int = 1) -> list[dict]:
        return []

    monkeypatch.setattr(DeerFlowClient, "get_thread_history", mock_get_thread_history)

    login = client.post("/auth/login", json={"username": "demo", "password": "demo1234"})
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    me = client.get("/me", headers=headers)
    db_session.add(AgentOwnership(agent_name="demo-agent", owner_user_id=me.json()["id"]))
    db_session.commit()
    conversation = ConversationService(db_session).create_conversation(
        user_id=me.json()["id"],
        deerflow_thread_id="thread-agent-456",
        agent_name="demo-agent",
    )

    detail = client.get(f"/conversations/{conversation.id}", headers=headers)

    assert detail.status_code == 200
    assert detail.json()["agent_name"] == "demo-agent"


def test_get_conversation_detail_rejects_invisible_agent_conversation(client, db_session, monkeypatch) -> None:
    async def mock_get_thread_history(self, thread_id: str, limit: int = 1) -> list[dict]:
        return []

    monkeypatch.setattr(DeerFlowClient, "get_thread_history", mock_get_thread_history)

    login = client.post("/auth/login", json={"username": "demo", "password": "demo1234"})
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    me = client.get("/me", headers=headers)
    conversation = ConversationService(db_session).create_conversation(
        user_id=me.json()["id"],
        deerflow_thread_id="thread-agent-hidden",
        agent_name="hidden-agent",
    )

    response = client.get(f"/conversations/{conversation.id}", headers=headers)

    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "agent_not_found"


def test_rename_conversation_updates_owned_title(client, db_session, monkeypatch) -> None:
    async def mock_create_thread(self) -> str:
        return "thread-123"

    async def mock_get_thread_history(self, thread_id: str, limit: int = 1) -> list[dict]:
        assert thread_id == "thread-123"
        assert limit == 1
        return []

    monkeypatch.setattr(DeerFlowClient, "create_thread", mock_create_thread)
    monkeypatch.setattr(DeerFlowClient, "get_thread_history", mock_get_thread_history)

    login = client.post("/auth/login", json={"username": "demo", "password": "demo1234"})
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    created = client.post("/conversations", headers=headers)
    renamed = client.request(
        "PATCH",
        f"/conversations/{created.json()['id']}",
        headers=headers,
        json={"title": "Renamed from API"},
    )
    detail = client.get(f"/conversations/{created.json()['id']}", headers=headers)

    assert renamed.status_code == 200
    assert renamed.json()["title"] == "Renamed from API"
    assert detail.status_code == 200
    assert detail.json()["title"] == "Renamed from API"


def test_delete_conversation_removes_owned_mapping(client, monkeypatch) -> None:
    async def mock_create_thread(self) -> str:
        return "thread-123"

    deleted_threads: list[str] = []

    async def mock_delete_thread(self, thread_id: str) -> dict:
        deleted_threads.append(thread_id)
        return {"success": True}

    monkeypatch.setattr(DeerFlowClient, "create_thread", mock_create_thread)
    monkeypatch.setattr(DeerFlowClient, "delete_thread", mock_delete_thread)

    login = client.post("/auth/login", json={"username": "demo", "password": "demo1234"})
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    created = client.post("/conversations", headers=headers)
    deleted = client.request(
        "DELETE",
        f"/conversations/{created.json()['id']}",
        headers=headers,
    )
    listed = client.get("/conversations", headers=headers)
    detail = client.get(f"/conversations/{created.json()['id']}", headers=headers)

    assert deleted.status_code == 200
    assert deleted.json() == {"success": True, "id": created.json()["id"]}
    assert deleted_threads == ["thread-123"]
    assert listed.status_code == 200
    assert listed.json() == []
    assert detail.status_code == 404


def test_pin_and_unpin_conversation_update_sidebar_order(client, monkeypatch) -> None:
    created_threads: list[str] = []

    async def mock_create_thread(self) -> str:
        thread_id = f"thread-{len(created_threads) + 1}"
        created_threads.append(thread_id)
        return thread_id

    monkeypatch.setattr(DeerFlowClient, "create_thread", mock_create_thread)

    login = client.post("/auth/login", json={"username": "demo", "password": "demo1234"})
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    first = client.post("/conversations", headers=headers)
    second = client.post("/conversations", headers=headers)

    pinned = client.request(
        "PATCH",
        f"/conversations/{second.json()['id']}",
        headers=headers,
        json={"is_pinned": True},
    )
    listed = client.get("/conversations", headers=headers)
    unpinned = client.request(
        "PATCH",
        f"/conversations/{second.json()['id']}",
        headers=headers,
        json={"is_pinned": False},
    )

    assert pinned.status_code == 200
    assert pinned.json()["is_pinned"] is True
    assert listed.status_code == 200
    assert listed.json()[0]["id"] == second.json()["id"]
    assert listed.json()[0]["is_pinned"] is True
    assert unpinned.status_code == 200
    assert unpinned.json()["is_pinned"] is False


def test_list_and_detail_include_non_null_agent_name(client, db_session, monkeypatch) -> None:
    async def mock_get_thread_history(self, thread_id: str, limit: int = 1) -> list[dict]:
        assert thread_id == "thread-agent-123"
        assert limit == 1
        return []

    monkeypatch.setattr(DeerFlowClient, "get_thread_history", mock_get_thread_history)

    user = db_session.query(User).filter(User.username == "demo").first()
    assert user is not None
    db_session.add(AgentOwnership(agent_name="demo-agent", owner_user_id=user.id))
    db_session.commit()

    conversation = Conversation(
        user_id=user.id,
        deerflow_thread_id="thread-agent-123",
        title="Agent conversation",
        agent_name="demo-agent",
    )
    db_session.add(conversation)
    db_session.commit()
    db_session.refresh(conversation)

    login = client.post("/auth/login", json={"username": "demo", "password": "demo1234"})
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    listed = client.get("/conversations", headers=headers)
    detail = client.get(f"/conversations/{conversation.id}", headers=headers)

    assert listed.status_code == 200
    assert listed.json()[0]["id"] == conversation.id
    assert listed.json()[0]["agent_name"] == "demo-agent"
    assert detail.status_code == 200
    assert detail.json()["id"] == conversation.id
    assert detail.json()["agent_name"] == "demo-agent"
