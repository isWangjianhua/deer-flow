from __future__ import annotations

import asyncio
import importlib
from contextlib import asynccontextmanager
from types import SimpleNamespace

gateway_app = importlib.import_module("app.gateway.app")


def test_lifespan_flushes_memory_queue_on_shutdown(monkeypatch):
    events: list[str] = []

    monkeypatch.setattr(gateway_app, "get_app_config", lambda: object())
    monkeypatch.setattr(gateway_app, "get_gateway_config", lambda: SimpleNamespace(host="0.0.0.0", port=8001))

    @asynccontextmanager
    async def fake_runtime_client_lifespan(app):
        events.append("runtime-enter")
        yield
        events.append("runtime-exit")

    async def fake_start_channel_service():
        events.append("channel-start")

        class _Service:
            def get_status(self):
                return {"service_running": True}

        return _Service()

    async def fake_stop_channel_service():
        events.append("channel-stop")

    class DummyQueue:
        def flush(self):
            events.append("memory-flush")

    monkeypatch.setattr(gateway_app, "runtime_client_lifespan", fake_runtime_client_lifespan)

    import app.channels.service as channel_service
    monkeypatch.setattr(channel_service, "start_channel_service", fake_start_channel_service)
    monkeypatch.setattr(channel_service, "stop_channel_service", fake_stop_channel_service)
    monkeypatch.setattr(gateway_app, "get_memory_queue", lambda: DummyQueue())

    async def exercise_lifespan():
        async with gateway_app.lifespan(SimpleNamespace()):
            events.append("inside")

    asyncio.run(exercise_lifespan())

    assert "memory-flush" in events
