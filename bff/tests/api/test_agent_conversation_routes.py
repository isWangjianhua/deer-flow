from app.clients.deerflow import DeerFlowClient
from app.core.security import create_access_token


def auth_headers() -> dict[str, str]:
    token = create_access_token("user-123")
    return {"Authorization": f"Bearer {token}"}


def test_create_agent_conversation_requires_auth(client) -> None:
    response = client.post("/agents/demo-agent/conversations")

    assert response.status_code == 401


def test_create_agent_conversation_persists_agent_name(client, monkeypatch) -> None:
    async def fake_create_thread(self) -> str:
        return "thread-agent-123"

    monkeypatch.setattr(DeerFlowClient, "create_thread", fake_create_thread)

    response = client.post(
        "/agents/demo-agent/conversations",
        headers=auth_headers(),
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["agent_name"] == "demo-agent"
    assert payload["title"] == "New conversation"
