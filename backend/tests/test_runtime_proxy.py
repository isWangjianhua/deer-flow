from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import HTTPException


@pytest.mark.anyio
async def test_load_thread_state_reads_from_runtime_client():
    from app.gateway.routers import threads

    class DummyRuntimeClient:
        async def get_thread_state(self, thread_id: str):
            assert thread_id == "thread_1"
            return {
                "values": {"title": "Hello", "messages": [{"id": "m1"}]},
                "next": ["node_a"],
                "metadata": {"created_at": "1"},
                "checkpoint": {"id": "cp_1", "ts": "1"},
                "checkpoint_id": "cp_1",
                "parent_checkpoint_id": None,
                "created_at": "1",
                "tasks": [{"id": "task_1", "name": "node_a"}],
            }

    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(runtime_client=DummyRuntimeClient())))

    state = await threads.load_thread_state("thread_1", request)

    assert state.checkpoint_id == "cp_1"
    assert state.values["title"] == "Hello"
    assert state.next == ["node_a"]


@pytest.mark.anyio
async def test_load_thread_state_maps_upstream_404():
    from app.gateway.routers import threads

    class DummyRuntimeClient:
        async def get_thread_state(self, thread_id: str):
            raise HTTPException(status_code=404, detail="Thread missing")

    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(runtime_client=DummyRuntimeClient())))

    with pytest.raises(HTTPException) as exc_info:
        await threads.load_thread_state("thread_missing", request)

    assert exc_info.value.status_code == 404
