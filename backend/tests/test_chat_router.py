from __future__ import annotations

from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.gateway.thread_ownership import create_owned_thread


def _build_app(chat_module, user_id: str) -> FastAPI:
    app = FastAPI()
    app.include_router(chat_module.router)

    def override_current_user():
        return SimpleNamespace(id=user_id)

    app.dependency_overrides[chat_module.get_current_user] = override_current_user
    return app


def test_chat_endpoint_creates_conversation_when_missing_id(tmp_path, monkeypatch):
    monkeypatch.setenv("DEER_FLOW_AUTH_DB_PATH", str(tmp_path / "auth.db"))
    from app.gateway.routers import chat

    async def fake_start_run(body, thread_id, request):
        return SimpleNamespace(run_id="run_1", thread_id=thread_id)

    async def fake_sse_consumer(bridge, record, request, run_mgr):
        yield 'event: messages/partial\ndata: {"text":"Hello"}\n\n'

    monkeypatch.setattr(chat, "start_run", fake_start_run)
    monkeypatch.setattr(chat, "sse_consumer", fake_sse_consumer)
    monkeypatch.setattr(chat, "get_stream_bridge", lambda request: object())
    monkeypatch.setattr(chat, "get_run_manager", lambda request: object())

    app = _build_app(chat, "user_a")
    with TestClient(app) as client:
        response = client.post(
            "/api/chat",
            json={
                "id": "req_1",
                "messages": [{"role": "user", "content": "Hello"}],
                "body": {},
            },
        )

    assert response.status_code == 200
    assert response.headers["x-vercel-ai-ui-message-stream"] == "v1"
    assert '"type": "data-conversation"' in response.text
    assert '"conversationId": "' in response.text
    assert '"type": "text-delta"' in response.text
    assert "data: [DONE]" in response.text


def test_chat_endpoint_rejects_foreign_conversation(tmp_path, monkeypatch):
    monkeypatch.setenv("DEER_FLOW_AUTH_DB_PATH", str(tmp_path / "auth.db"))
    create_owned_thread(user_id="user_a", biz_thread_id="conv_a")
    from app.gateway.routers import chat

    async def fake_start_run(body, thread_id, request):
        return SimpleNamespace(run_id="run_1", thread_id=thread_id)

    async def fake_sse_consumer(bridge, record, request, run_mgr):
        yield 'event: messages/partial\ndata: {"text":"Hello"}\n\n'

    monkeypatch.setattr(chat, "start_run", fake_start_run)
    monkeypatch.setattr(chat, "sse_consumer", fake_sse_consumer)
    monkeypatch.setattr(chat, "get_stream_bridge", lambda request: object())
    monkeypatch.setattr(chat, "get_run_manager", lambda request: object())

    app = _build_app(chat, "user_b")
    with TestClient(app) as client:
        response = client.post(
            "/api/chat",
            json={
                "id": "req_1",
                "messages": [{"role": "user", "content": "Hello"}],
                "body": {"conversation_id": "conv_a"},
            },
        )

    assert response.status_code == 404
