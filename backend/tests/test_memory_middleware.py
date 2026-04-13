"""Tests for request-time memory injection middleware behavior."""

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

from langchain_core.messages import AIMessage, HumanMessage

import deerflow.agents.middlewares.memory_middleware as memory_middleware_module
from deerflow.agents.middlewares.memory_middleware import MemoryMiddleware
from deerflow.config.memory_config import MemoryConfig


def test_memory_middleware_injects_mem0_results_for_user_scope(monkeypatch):
    middleware = MemoryMiddleware()
    state = {"messages": [HumanMessage(content="What should I read next?")]}
    runtime = SimpleNamespace(context={"thread_id": "thread-1", "user_id": "user-42"})

    storage = MagicMock()
    storage.asearch = AsyncMock(
        return_value=[{"id": "mem-1", "memory": "User likes hard sci-fi novels.", "score": 0.97}]
    )
    monkeypatch.setattr(
        memory_middleware_module,
        "get_memory_config",
        lambda: MemoryConfig(provider="mem0", injection_enabled=True, max_injection_tokens=1200, mem0_search_limit=4),
    )
    monkeypatch.setattr(memory_middleware_module, "get_memory_storage", lambda: storage, raising=False)

    result = asyncio.run(middleware.abefore_model(state, runtime))

    assert result is not None
    assert "User likes hard sci-fi novels." in result["messages"][0].content
    storage.asearch.assert_awaited_once_with(
        query="What should I read next?",
        user_id="user-42",
        limit=4,
    )


def test_memory_middleware_after_agent_queues_user_id(monkeypatch):
    middleware = MemoryMiddleware()
    state = {
        "messages": [
            HumanMessage(content="Remember that I like sci-fi books."),
            AIMessage(content="Noted."),
        ]
    }
    runtime = SimpleNamespace(context={"thread_id": "thread-1", "user_id": "user-42"})
    queue = MagicMock()

    monkeypatch.setattr(
        memory_middleware_module,
        "get_memory_config",
        lambda: MemoryConfig(enabled=True),
    )
    monkeypatch.setattr(memory_middleware_module, "get_memory_queue", lambda: queue)

    result = middleware.after_agent(state, runtime)

    assert result is None
    queue.add.assert_called_once()
    assert queue.add.call_args.kwargs["user_id"] == "user-42"
