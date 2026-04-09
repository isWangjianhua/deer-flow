from app.clients.deerflow import DeerFlowClient


def test_create_conversation_requires_auth(client) -> None:
    response = client.post("/conversations")

    assert response.status_code == 401


def test_create_and_list_conversations(client, monkeypatch) -> None:
    async def mock_create_thread(self) -> str:
        return "thread-123"

    monkeypatch.setattr(DeerFlowClient, "create_thread", mock_create_thread)

    login = client.post("/auth/login", json={"username": "demo", "password": "demo123"})
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

    login = client.post("/auth/login", json={"username": "demo", "password": "demo123"})
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    created = client.post("/conversations", headers=headers)
    detail = client.get(f"/conversations/{created.json()['id']}", headers=headers)

    assert detail.status_code == 200
    payload = detail.json()
    assert payload["id"] == created.json()["id"]
    assert payload["values"]["title"] == "Loaded conversation"
    assert payload["values"]["messages"][0]["id"] == "human-1"
