from __future__ import annotations

import asyncio
from io import BytesIO
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi import UploadFile
from starlette.requests import Request

from app.gateway.routers import artifacts, suggestions, thread_runs, uploads
from app.gateway.thread_ownership import create_owned_thread, list_owned_threads


def _override_user(user_id: str):
    def _inner():
        return SimpleNamespace(id=user_id)

    return _inner


def test_artifact_route_rejects_foreign_thread_owner(tmp_path, monkeypatch):
    monkeypatch.setenv("DEER_FLOW_AUTH_DB_PATH", str(tmp_path / "auth.db"))
    create_owned_thread(user_id="user_a", biz_thread_id="thread_a")
    request = Request({"type": "http", "method": "GET", "path": "/", "headers": [], "query_string": b""})

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            artifacts.get_artifact(
                "thread_a",
                "mnt/user-data/outputs/note.txt",
                request,
                user=SimpleNamespace(id="user_b"),
            )
        )

    assert exc_info.value.status_code == 404
    assert exc_info.value.detail == "Thread thread_a not found"


def test_upload_route_rejects_foreign_thread_owner(tmp_path, monkeypatch):
    monkeypatch.setenv("DEER_FLOW_AUTH_DB_PATH", str(tmp_path / "auth.db"))
    create_owned_thread(user_id="user_a", biz_thread_id="thread_a")

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            uploads.upload_files(
                "thread_a",
                files=[UploadFile(filename="note.txt", file=BytesIO(b"hello"))],
                user=SimpleNamespace(id="user_b"),
            )
        )

    assert exc_info.value.status_code == 404
    assert exc_info.value.detail == "Thread thread_a not found"


@pytest.mark.anyio
async def test_thread_runs_create_run_rejects_foreign_thread_owner(tmp_path, monkeypatch):
    monkeypatch.setenv("DEER_FLOW_AUTH_DB_PATH", str(tmp_path / "auth.db"))
    create_owned_thread(user_id="user_a", biz_thread_id="thread_a")

    called = False

    async def fake_create_thread_run(*, thread_id, payload, request=None):
        nonlocal called
        called = True
        return None

    monkeypatch.setattr(thread_runs, "create_thread_run", fake_create_thread_run)

    with pytest.raises(HTTPException) as exc_info:
        await thread_runs.create_run(
            "thread_a",
            thread_runs.RunCreateRequest(),
            SimpleNamespace(),
            user=SimpleNamespace(id="user_b"),
        )

    assert exc_info.value.status_code == 404
    assert exc_info.value.detail == "Thread thread_a not found"
    assert called is False


@pytest.mark.anyio
async def test_thread_runs_force_path_thread_and_current_user_into_run_config(tmp_path, monkeypatch):
    monkeypatch.setenv("DEER_FLOW_AUTH_DB_PATH", str(tmp_path / "auth.db"))
    owner_record = create_owned_thread(user_id="user_a", biz_thread_id="thread_a")

    captured: dict[str, object] = {}

    async def fake_create_thread_run(*, thread_id, payload, request=None):
        captured["thread_id"] = thread_id
        captured["payload"] = payload
        return {
            "run_id": "run_1",
            "thread_id": thread_id,
            "assistant_id": None,
            "status": "pending",
            "metadata": {},
            "kwargs": {},
            "multitask_strategy": "reject",
            "created_at": "",
            "updated_at": "",
        }

    monkeypatch.setattr(thread_runs, "create_thread_run", fake_create_thread_run)

    response = await thread_runs.create_run(
        "thread_a",
        thread_runs.RunCreateRequest(config={"configurable": {"thread_id": "evil", "user_id": "evil"}}),
        SimpleNamespace(),
        user=SimpleNamespace(id="user_a"),
    )

    assert captured["thread_id"] == owner_record.langgraph_thread_id
    assert captured["payload"]["config"] == {"configurable": {"thread_id": owner_record.langgraph_thread_id, "user_id": "user_a"}}
    assert response.thread_id == "thread_a"


@pytest.mark.anyio
async def test_stateless_runs_create_owned_thread_for_authenticated_user(tmp_path, monkeypatch):
    monkeypatch.setenv("DEER_FLOW_AUTH_DB_PATH", str(tmp_path / "auth.db"))
    import app.gateway.routers.runs as runs_router

    captured: dict[str, object] = {}

    async def fake_stream_stateless_run(*, payload, request):
        captured["thread_id"] = payload["config"]["configurable"]["thread_id"]
        captured["config"] = payload["config"]
        yield 'event: done\ndata: {}\n\n'

    monkeypatch.setattr(runs_router, "stream_stateless_run", fake_stream_stateless_run)

    response = await runs_router.stateless_stream(
        thread_runs.RunCreateRequest(),
        SimpleNamespace(),
        user=SimpleNamespace(id="user_a"),
    )
    async for _ in response.body_iterator:
        pass

    assert response.media_type == "text/event-stream"
    assert captured["config"] == {"configurable": {"thread_id": captured["thread_id"], "user_id": "user_a"}}
    records = list_owned_threads("user_a")
    assert len(records) == 1
    assert records[0].langgraph_thread_id == captured["thread_id"]


@pytest.mark.anyio
async def test_stateless_runs_reject_foreign_thread_when_thread_id_supplied(tmp_path, monkeypatch):
    monkeypatch.setenv("DEER_FLOW_AUTH_DB_PATH", str(tmp_path / "auth.db"))
    import app.gateway.routers.runs as runs_router

    create_owned_thread(user_id="user_a", biz_thread_id="thread_a")

    called = False

    async def fake_stream_stateless_run(*, payload, request):
        nonlocal called
        called = True
        if False:
            yield ""

    monkeypatch.setattr(runs_router, "stream_stateless_run", fake_stream_stateless_run)

    with pytest.raises(HTTPException) as exc_info:
        await runs_router.stateless_stream(
            thread_runs.RunCreateRequest(config={"configurable": {"thread_id": "thread_a"}}),
            SimpleNamespace(),
            user=SimpleNamespace(id="user_b"),
        )

    assert exc_info.value.status_code == 404
    assert exc_info.value.detail == "Thread thread_a not found"
    assert called is False


@pytest.mark.anyio
async def test_suggestions_reject_foreign_thread_owner(tmp_path, monkeypatch):
    monkeypatch.setenv("DEER_FLOW_AUTH_DB_PATH", str(tmp_path / "auth.db"))
    create_owned_thread(user_id="user_a", biz_thread_id="thread_a")

    called = False

    fake_model = SimpleNamespace()

    def fake_invoke(prompt):
        nonlocal called
        called = True
        return SimpleNamespace(content='["Q1"]')

    fake_model.invoke = fake_invoke
    monkeypatch.setattr(suggestions, "create_chat_model", lambda **kwargs: fake_model)

    with pytest.raises(HTTPException) as exc_info:
        await suggestions.generate_suggestions(
            "thread_a",
            suggestions.SuggestionsRequest(messages=[suggestions.SuggestionMessage(role="user", content="Hi")]),
            user=SimpleNamespace(id="user_b"),
        )

    assert exc_info.value.status_code == 404
    assert exc_info.value.detail == "Thread thread_a not found"
    assert called is False
