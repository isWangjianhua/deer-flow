from app.clients.deerflow import DeerFlowClient


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
    assert listed.status_code == 200
    assert len(listed.json()) == 1
    assert listed.json()[0]["id"] == created.json()["id"]


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
    assert payload["values"]["title"] == "Loaded conversation"
    assert payload["values"]["messages"][0]["id"] == "human-1"


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
