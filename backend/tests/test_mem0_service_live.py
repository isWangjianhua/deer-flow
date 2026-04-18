"""Live Mem0/Qdrant smoke tests.

These tests require a working `config.yaml` with a real `memory.provider=mem0`
configuration backed by Qdrant and valid LLM/embedder credentials.

They are skipped in CI and must be run explicitly:

    DEERFLOW_RUN_MEM0_LIVE_TESTS=1 PYTHONPATH=. uv run pytest tests/test_mem0_service_live.py -v -s
"""

from __future__ import annotations

import os
import time
import uuid

import httpx
import pytest
from langchain_core.messages import AIMessage, HumanMessage

from deerflow.agents.memory.mem0_service import Mem0Service, reset_mem0_service
from deerflow.config.app_config import AppConfig, reload_app_config
from deerflow.config.memory_config import MemoryConfig, get_memory_config, set_memory_config

_ORIGINAL_MEMORY_CONFIG = get_memory_config()
_skip_reason: str | None = None

if os.environ.get("CI"):
    _skip_reason = "Live tests skipped in CI"
elif os.environ.get("DEERFLOW_RUN_MEM0_LIVE_TESTS") != "1":
    _skip_reason = "Set DEERFLOW_RUN_MEM0_LIVE_TESTS=1 to run Mem0 live smoke tests"
else:
    try:
        reload_app_config(str(AppConfig.resolve_config_path()))
    except FileNotFoundError:
        _skip_reason = "No config.yaml found — live Mem0 tests require real runtime config"

if _skip_reason is None:
    _memory_config = get_memory_config()
    _mem0_config = _memory_config.mem0
    _vector_store = _mem0_config.get("vector_store") or {}
    _qdrant_config = _vector_store.get("config") or {}
    _qdrant_host = str(_qdrant_config.get("host") or "127.0.0.1")
    _qdrant_port = int(_qdrant_config.get("port") or 6333)

    if _memory_config.provider != "mem0":
        _skip_reason = "Live Mem0 tests require memory.provider=mem0"
    elif _vector_store.get("provider") != "qdrant":
        _skip_reason = "Live Mem0 tests require memory.mem0_config.vector_store.provider=qdrant"
    else:
        try:
            response = httpx.get(f"http://{_qdrant_host}:{_qdrant_port}/healthz", timeout=2.0)
            response.raise_for_status()
        except Exception:
            _skip_reason = f"Qdrant is not reachable at http://{_qdrant_host}:{_qdrant_port}/healthz"

if _skip_reason:
    pytest.skip(_skip_reason, allow_module_level=True)


@pytest.fixture(autouse=True)
def _reset_mem0_singletons():
    reset_mem0_service()
    yield
    reset_mem0_service()
    set_memory_config(_ORIGINAL_MEMORY_CONFIG)


def _memory_texts(results: list[dict[str, object]]) -> list[str]:
    texts: list[str] = []
    for item in results:
        text = item.get("memory") or item.get("text") or item.get("content")
        if isinstance(text, str) and text.strip():
            texts.append(text.strip())
    return texts


def _wait_for_memories(service: Mem0Service, *, user_id: str, query: str, timeout_seconds: float = 25.0) -> tuple[list[dict[str, object]], list[dict[str, object]]]:
    deadline = time.monotonic() + timeout_seconds
    all_results: list[dict[str, object]] = []
    query_results: list[dict[str, object]] = []

    while time.monotonic() < deadline:
        all_results = service.get_all(user_id=user_id, limit=10)
        query_results = service.search(query=query, user_id=user_id, limit=5)
        combined_text = " ".join(_memory_texts(all_results) + _memory_texts(query_results)).lower()
        if "lapsang" in combined_text and "tea" in combined_text:
            return all_results, query_results
        time.sleep(1.0)

    return all_results, query_results


class TestLiveMem0Service:
    def test_add_conversation_round_trip_persists_and_retrieves_memory(self):
        service = Mem0Service()
        user_id = f"mem0-live-{uuid.uuid4().hex[:10]}"
        run_id = f"mem0-run-{uuid.uuid4().hex[:8]}"
        messages = [
            HumanMessage(content="For future conversations, remember that I prefer smoked lapsang souchong tea over coffee."),
            AIMessage(content="Understood — I'll remember that you prefer smoked lapsang souchong tea."),
        ]

        try:
            service.delete_all(user_id=user_id)

            result = service.add_conversation(
                messages=messages,
                user_id=user_id,
                run_id=run_id,
                metadata={"source": run_id, "thread_id": run_id},
            )

            assert result is not None

            all_results, query_results = _wait_for_memories(
                service,
                user_id=user_id,
                query="Which tea does the user prefer? lapsang souchong",
            )

            all_text = _memory_texts(all_results)
            query_text = _memory_texts(query_results)

            assert all_text, "Expected Mem0 get_all() to return at least one stored memory"
            assert query_text, "Expected Mem0 search() to return at least one relevant memory"
            assert any("lapsang" in text.lower() and "tea" in text.lower() for text in all_text)
            assert any("lapsang" in text.lower() and "tea" in text.lower() for text in query_text)
        finally:
            service.delete_all(user_id=user_id)
