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
