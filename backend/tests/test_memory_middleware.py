from types import SimpleNamespace
from unittest.mock import ANY, MagicMock

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
        trace_parent=None,
    )


def test_memory_middleware_traces_mem0_queue_decision(monkeypatch):
    middleware = MemoryMiddleware(agent_name=None)
    state = {
        "messages": [
            HumanMessage(content="hello"),
            AIMessage(content="hi"),
        ]
    }
    runtime = SimpleNamespace(context={"thread_id": "thread-1"})
    queue = SimpleNamespace(add=MagicMock())
    traced = []
    calls = []
    outputs = []

    class _Span:
        def __enter__(self):
            traced.append(True)
            return self

        def end(self, *, outputs=None):
            outputs_list.append(outputs)

        def __exit__(self, exc_type, exc, tb):
            return False

    outputs_list = outputs

    def _memory_trace(*args, **kwargs):
        calls.append(kwargs)
        return _Span()

    monkeypatch.setattr("deerflow.agents.middlewares.memory_middleware.memory_trace", _memory_trace)
    monkeypatch.setattr(
        "deerflow.agents.middlewares.memory_middleware.get_memory_config",
        lambda: SimpleNamespace(enabled=True, write_enabled=True, provider="mem0"),
    )
    monkeypatch.setattr(
        "deerflow.agents.middlewares.memory_middleware.get_config",
        lambda: {"configurable": {"user_id": "user-123", "thread_id": "thread-1"}},
    )
    monkeypatch.setattr("deerflow.agents.middlewares.memory_middleware.filter_messages_for_memory", lambda messages: messages)
    monkeypatch.setattr("deerflow.agents.middlewares.memory_middleware.detect_correction", lambda messages: False)
    monkeypatch.setattr("deerflow.agents.middlewares.memory_middleware.detect_reinforcement", lambda messages: False)
    monkeypatch.setattr("deerflow.agents.middlewares.memory_middleware.get_memory_queue", lambda: queue)

    middleware.after_agent(state, runtime)

    assert traced == [True]
    assert calls[0]["inputs"] == {"message_count": 2, "filtered_message_count": 2}
    assert outputs[0]["queued"] is True
    assert outputs[0]["correction_detected"] is False
    assert outputs[0]["reinforcement_detected"] is False
    assert outputs[0]["filtered_messages"] == ["hello", "hi"]


def test_memory_middleware_traces_skip_reason_when_thread_missing(monkeypatch):
    middleware = MemoryMiddleware(agent_name=None)
    state = {"messages": [HumanMessage(content="hello"), AIMessage(content="hi")]}
    runtime = SimpleNamespace(context={})
    calls = []
    outputs = []

    class _Span:
        def __enter__(self):
            return self

        def end(self, *, outputs=None):
            outputs_list.append(outputs)

        def __exit__(self, exc_type, exc, tb):
            return False

    outputs_list = outputs

    def _memory_trace(*args, **kwargs):
        calls.append(kwargs)
        return _Span()

    monkeypatch.setattr("deerflow.agents.middlewares.memory_middleware.memory_trace", _memory_trace)
    monkeypatch.setattr(
        "deerflow.agents.middlewares.memory_middleware.get_memory_config",
        lambda: SimpleNamespace(enabled=True, write_enabled=True, provider="mem0"),
    )
    monkeypatch.setattr(
        "deerflow.agents.middlewares.memory_middleware.get_config",
        lambda: {"configurable": {"user_id": "user-123"}},
    )

    result = middleware.after_agent(state, runtime)

    assert result is None
    assert outputs == [{"queued": False, "skip_reason": "missing_thread_id"}]


def test_memory_middleware_traces_skip_reason_when_conversation_not_meaningful(monkeypatch):
    middleware = MemoryMiddleware(agent_name=None)
    state = {"messages": [HumanMessage(content="hello")]}
    runtime = SimpleNamespace(context={"thread_id": "thread-1", "user_id": "user-123"})
    outputs = []

    class _Span:
        def __enter__(self):
            return self

        def end(self, *, outputs=None):
            outputs_list.append(outputs)

        def __exit__(self, exc_type, exc, tb):
            return False

    outputs_list = outputs
    monkeypatch.setattr("deerflow.agents.middlewares.memory_middleware.memory_trace", lambda *args, **kwargs: _Span())
    monkeypatch.setattr(
        "deerflow.agents.middlewares.memory_middleware.get_memory_config",
        lambda: SimpleNamespace(enabled=True, write_enabled=True, provider="mem0"),
    )
    monkeypatch.setattr("deerflow.agents.middlewares.memory_middleware.filter_messages_for_memory", lambda messages: messages)

    result = middleware.after_agent(state, runtime)

    assert result is None
    assert outputs == [{"queued": False, "skip_reason": "no_meaningful_conversation"}]


def test_memory_middleware_forwards_current_run_tree_to_queue(monkeypatch):
    middleware = MemoryMiddleware(agent_name=None)
    state = {"messages": [HumanMessage(content="hello"), AIMessage(content="hi")]}
    runtime = SimpleNamespace(context={"thread_id": "thread-1"})
    queue = SimpleNamespace(add=MagicMock())
    fake_run_tree = object()

    monkeypatch.setattr("deerflow.agents.middlewares.memory_middleware.get_memory_config", lambda: SimpleNamespace(enabled=True, provider="mem0"))
    monkeypatch.setattr("deerflow.agents.middlewares.memory_middleware.get_config", lambda: {"configurable": {"user_id": "user-123", "thread_id": "thread-1"}})
    monkeypatch.setattr("deerflow.agents.middlewares.memory_middleware.filter_messages_for_memory", lambda messages: messages)
    monkeypatch.setattr("deerflow.agents.middlewares.memory_middleware.detect_correction", lambda messages: False)
    monkeypatch.setattr("deerflow.agents.middlewares.memory_middleware.detect_reinforcement", lambda messages: False)
    monkeypatch.setattr("deerflow.agents.middlewares.memory_middleware.get_memory_queue", lambda: queue)
    monkeypatch.setattr("deerflow.agents.middlewares.memory_middleware.get_current_run_tree", lambda: fake_run_tree)

    middleware.after_agent(state, runtime)

    assert queue.add.call_args.kwargs["trace_parent"] is fake_run_tree
