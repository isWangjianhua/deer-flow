from app.clients.deerflow import DeerFlowClient
from app.core.security import create_access_token


def test_memory_requires_auth(client) -> None:
    response = client.get("/memory")

    assert response.status_code == 401


def test_memory_forwards_authenticated_user_id(client, monkeypatch) -> None:
    calls: list[str] = []

    async def fake_get_memory(self, *, user_id: str) -> dict:
        calls.append(user_id)
        return {
            "version": "1.0",
            "lastUpdated": "2026-04-21T12:00:00Z",
            "user": {
                "workContext": {
                    "summary": "work",
                    "updatedAt": "2026-04-21T12:00:00Z",
                },
                "personalContext": {
                    "summary": "personal",
                    "updatedAt": "2026-04-21T12:00:00Z",
                },
                "topOfMind": {
                    "summary": "mind",
                    "updatedAt": "2026-04-21T12:00:00Z",
                },
            },
            "history": {
                "recentMonths": {
                    "summary": "recent",
                    "updatedAt": "2026-04-21T12:00:00Z",
                },
                "earlierContext": {
                    "summary": "earlier",
                    "updatedAt": "2026-04-21T12:00:00Z",
                },
                "longTermBackground": {
                    "summary": "background",
                    "updatedAt": "2026-04-21T12:00:00Z",
                },
            },
            "facts": [],
        }

    monkeypatch.setattr(DeerFlowClient, "get_memory", fake_get_memory)

    token = create_access_token("user-123")
    response = client.get("/memory", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert response.json()["version"] == "1.0"
    assert calls == ["user-123"]


def test_memory_normalizes_deerflow_errors(client, monkeypatch) -> None:
    async def fake_get_memory(self, *, user_id: str) -> dict:
        raise RuntimeError("gateway down")

    monkeypatch.setattr(DeerFlowClient, "get_memory", fake_get_memory)

    token = create_access_token("user-123")
    response = client.get("/memory", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 502
    assert response.json()["detail"]["code"] == "memory_unavailable"
