from types import SimpleNamespace
from unittest.mock import MagicMock

from langchain_core.messages import AIMessage, HumanMessage

from deerflow.agents.middlewares.memory_middleware import MemoryMiddleware


def test_memory_middleware_skips_global_memory_updates_for_authenticated_file_memory(monkeypatch):
    middleware = MemoryMiddleware(agent_name=None)
    state = {
        "messages": [
            HumanMessage(content="hello", id="h-1"),
            AIMessage(content="hi", id="a-1"),
        ]
    }
    runtime = SimpleNamespace(context={"thread_id": "thread-1"})
    queue = SimpleNamespace(add=MagicMock())

    monkeypatch.setattr(
        "deerflow.agents.middlewares.memory_middleware.get_memory_config",
        lambda: SimpleNamespace(enabled=True, provider="file"),
    )
    monkeypatch.setattr(
        "deerflow.agents.middlewares.memory_middleware.get_config",
        lambda: {"configurable": {"user_id": "user-123", "thread_id": "thread-1"}},
    )
    monkeypatch.setattr(
        "deerflow.agents.middlewares.memory_middleware.filter_messages_for_memory",
        lambda messages: messages,
    )
    monkeypatch.setattr(
        "deerflow.agents.middlewares.memory_middleware.detect_correction",
        lambda messages: False,
    )
    monkeypatch.setattr(
        "deerflow.agents.middlewares.memory_middleware.detect_reinforcement",
        lambda messages: False,
    )
    monkeypatch.setattr(
        "deerflow.agents.middlewares.memory_middleware.get_memory_queue",
        lambda: queue,
    )

    result = middleware.after_agent(state, runtime)

    assert result is None
    queue.add.assert_not_called()


def test_memory_middleware_queues_mem0_update_for_authenticated_user(monkeypatch):
    middleware = MemoryMiddleware(agent_name=None)
    state = {
        "messages": [
            HumanMessage(content="hello", id="h-1"),
            AIMessage(content="hi", id="a-1"),
        ]
    }
    runtime = SimpleNamespace(context={"thread_id": "thread-1"})
    queue = SimpleNamespace(add=MagicMock())

    monkeypatch.setattr(
        "deerflow.agents.middlewares.memory_middleware.get_memory_config",
        lambda: SimpleNamespace(enabled=True, provider="mem0"),
    )
    monkeypatch.setattr(
        "deerflow.agents.middlewares.memory_middleware.get_config",
        lambda: {"configurable": {"user_id": "user-123", "thread_id": "thread-1"}},
    )
    monkeypatch.setattr(
        "deerflow.agents.middlewares.memory_middleware.filter_messages_for_memory",
        lambda messages: messages,
    )
    monkeypatch.setattr(
        "deerflow.agents.middlewares.memory_middleware.detect_correction",
        lambda messages: False,
    )
    monkeypatch.setattr(
        "deerflow.agents.middlewares.memory_middleware.detect_reinforcement",
        lambda messages: False,
    )
    monkeypatch.setattr(
        "deerflow.agents.middlewares.memory_middleware.get_memory_queue",
        lambda: queue,
    )

    result = middleware.after_agent(state, runtime)

    assert result is None
    queue.add.assert_called_once_with(
        thread_id="thread-1",
        user_id="user-123",
        messages=state["messages"],
        agent_name=None,
        correction_detected=False,
        reinforcement_detected=False,
    )
