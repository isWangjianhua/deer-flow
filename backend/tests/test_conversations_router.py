from __future__ import annotations

from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.gateway.routers import conversations
from app.gateway.thread_ownership import create_owned_thread, get_thread_owner_record


def _build_app(user_id: str) -> FastAPI:
    app = FastAPI()
    app.state.runtime_client = _FakeRuntimeClient()
    app.include_router(conversations.router)

    def override_current_user():
        return SimpleNamespace(id=user_id)

    app.dependency_overrides[conversations.get_current_user] = override_current_user
    return app


class _FakeRuntimeClient:
    def __init__(self) -> None:
        self.threads: dict[str, dict] = {}

    async def get_thread(self, thread_id: str) -> dict:
        thread = self.threads.get(thread_id)
        if thread is None:
            from fastapi import HTTPException

            raise HTTPException(status_code=404, detail="Thread not found")
        return thread

    async def create_thread(self, payload: dict) -> dict:
        thread_id = payload["thread_id"]
        thread = {"thread_id": thread_id, "metadata": payload.get("metadata", {})}
        self.threads[thread_id] = thread
        return thread


def test_list_conversations_only_returns_current_users_records(tmp_path, monkeypatch):
    monkeypatch.setenv("DEER_FLOW_AUTH_DB_PATH", str(tmp_path / "auth.db"))
    create_owned_thread(user_id="user_a", biz_thread_id="conv_a", title="Alpha")
    create_owned_thread(user_id="user_b", biz_thread_id="conv_b", title="Beta")

    app = _build_app("user_a")
    with TestClient(app) as client:
        response = client.get("/api/conversations")

    assert response.status_code == 200
    assert [item["conversation_id"] for item in response.json()] == ["conv_a"]
    assert [item["title"] for item in response.json()] == ["Alpha"]


def test_create_conversation_creates_owned_thread(tmp_path, monkeypatch):
    monkeypatch.setenv("DEER_FLOW_AUTH_DB_PATH", str(tmp_path / "auth.db"))

    app = _build_app("user_a")
    with TestClient(app) as client:
        response = client.post("/api/conversations", json={"title": "New chat"})

    assert response.status_code == 201
    payload = response.json()
    assert payload["conversation_id"].startswith("thread_")
    assert payload["title"] == "New chat"
    record = get_thread_owner_record(payload["conversation_id"])
    assert record is not None
    assert client.app.state.runtime_client.threads[record.langgraph_thread_id]["thread_id"] == record.langgraph_thread_id


def test_get_foreign_conversation_returns_404(tmp_path, monkeypatch):
    monkeypatch.setenv("DEER_FLOW_AUTH_DB_PATH", str(tmp_path / "auth.db"))
    create_owned_thread(user_id="user_a", biz_thread_id="conv_a", title="Alpha")

    app = _build_app("user_b")
    with TestClient(app) as client:
        response = client.get("/api/conversations/conv_a")

    assert response.status_code == 404


def test_delete_conversation_returns_204_and_removes_record(tmp_path, monkeypatch):
    monkeypatch.setenv("DEER_FLOW_AUTH_DB_PATH", str(tmp_path / "auth.db"))
    create_owned_thread(user_id="user_a", biz_thread_id="conv_a", title="Alpha")

    app = _build_app("user_a")
    with TestClient(app) as client:
        response = client.delete("/api/conversations/conv_a")
        list_response = client.get("/api/conversations")

    assert response.status_code == 204
    assert list_response.status_code == 200
    assert list_response.json() == []


def test_patch_conversation_updates_title_for_owner(tmp_path, monkeypatch):
    monkeypatch.setenv("DEER_FLOW_AUTH_DB_PATH", str(tmp_path / "auth.db"))
    create_owned_thread(user_id="user_a", biz_thread_id="conv_a", title="Alpha")

    app = _build_app("user_a")
    with TestClient(app) as client:
        response = client.patch("/api/conversations/conv_a", json={"title": "Renamed"})
        get_response = client.get("/api/conversations/conv_a")

    assert response.status_code == 200
    assert response.json()["title"] == "Renamed"
    assert get_response.status_code == 200
    assert get_response.json()["title"] == "Renamed"
