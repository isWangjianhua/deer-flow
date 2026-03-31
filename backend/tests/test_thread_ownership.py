from __future__ import annotations

from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.gateway.routers import threads
from app.gateway.thread_ownership import (
    create_owned_thread,
    ensure_thread_belongs_to_user,
    list_owned_threads,
)


class _FakeStore:
    def __init__(self, items: list[dict] | None = None):
        self._items = items or []

    async def asearch(self, namespace, limit=10_000):
        return [SimpleNamespace(value=item) for item in self._items[:limit]]


class _EmptyCheckpointer:
    async def alist(self, config=None, limit=None):
        if False:
            yield None
        return


def _build_app(user_id: str, *, store_items: list[dict] | None = None) -> FastAPI:
    app = FastAPI()
    app.include_router(threads.router)
    app.state.store = _FakeStore(store_items)
    app.state.checkpointer = _EmptyCheckpointer()

    def override_current_user():
        return SimpleNamespace(id=user_id)

    app.dependency_overrides[threads.get_current_user] = override_current_user
    return app


def test_create_owned_thread_keeps_langgraph_thread_id_equal_to_business_id(tmp_path, monkeypatch):
    monkeypatch.setenv("DEER_FLOW_AUTH_DB_PATH", str(tmp_path / "auth.db"))

    record = create_owned_thread(user_id="user_a", biz_thread_id="thread_a")

    assert record.id == "thread_a"
    assert record.langgraph_thread_id == "thread_a"
    assert record.user_id == "user_a"


def test_list_owned_threads_only_returns_current_users_records(tmp_path, monkeypatch):
    monkeypatch.setenv("DEER_FLOW_AUTH_DB_PATH", str(tmp_path / "auth.db"))
    create_owned_thread(user_id="user_a", biz_thread_id="thread_a")
    create_owned_thread(user_id="user_b", biz_thread_id="thread_b")

    records = list_owned_threads("user_a")

    assert [record.id for record in records] == ["thread_a"]


def test_ensure_thread_belongs_to_user_rejects_foreign_owner(tmp_path, monkeypatch):
    monkeypatch.setenv("DEER_FLOW_AUTH_DB_PATH", str(tmp_path / "auth.db"))
    create_owned_thread(user_id="user_a", biz_thread_id="thread_a")

    try:
        ensure_thread_belongs_to_user(biz_thread_id="thread_a", user_id="user_b")
    except PermissionError as exc:
        assert str(exc) == "thread_a"
    else:
        raise AssertionError("Expected foreign thread lookup to fail")


def test_search_threads_only_returns_current_users_threads(tmp_path, monkeypatch):
    monkeypatch.setenv("DEER_FLOW_AUTH_DB_PATH", str(tmp_path / "auth.db"))
    create_owned_thread(user_id="user_a", biz_thread_id="thread_a")
    create_owned_thread(user_id="user_b", biz_thread_id="thread_b")

    app = _build_app(
        "user_a",
        store_items=[
            {
                "thread_id": "thread_a",
                "status": "idle",
                "created_at": 1,
                "updated_at": 2,
                "metadata": {},
                "values": {},
            },
            {
                "thread_id": "thread_b",
                "status": "idle",
                "created_at": 1,
                "updated_at": 3,
                "metadata": {},
                "values": {},
            },
        ],
    )

    with TestClient(app) as client:
        response = client.post("/api/threads/search", json={})

    assert response.status_code == 200
    assert [item["thread_id"] for item in response.json()] == ["thread_a"]


def test_delete_thread_rejects_other_user(tmp_path, monkeypatch):
    monkeypatch.setenv("DEER_FLOW_AUTH_DB_PATH", str(tmp_path / "auth.db"))
    create_owned_thread(user_id="user_a", biz_thread_id="thread_a")

    app = _build_app("user_b")

    with TestClient(app) as client:
        response = client.delete("/api/threads/thread_a")

    assert response.status_code == 404
