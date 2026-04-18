from types import SimpleNamespace
from unittest.mock import MagicMock

from langchain_core.messages import HumanMessage, SystemMessage

from deerflow.agents.middlewares.mem0_injection_middleware import Mem0InjectionMiddleware


def test_mem0_injection_middleware_delegates_to_retrieval_policy(monkeypatch):
    middleware = Mem0InjectionMiddleware()
    request = MagicMock()
    request.messages = [
        HumanMessage(content="First question"),
        HumanMessage(content="Need Tianjin machining suppliers for semiconductor parts"),
    ]
    patched_request = MagicMock()
    request.override.return_value = patched_request
    handler = MagicMock(return_value="response")

    monkeypatch.setattr(
        "deerflow.agents.middlewares.mem0_injection_middleware.get_memory_config",
        lambda: SimpleNamespace(enabled=True, injection_enabled=True, provider="mem0", search_limit=5, max_injection_tokens=2000),
    )
    monkeypatch.setattr(
        "deerflow.agents.middlewares.mem0_injection_middleware.get_config",
        lambda: {"configurable": {"user_id": "user-123"}},
    )
    monkeypatch.setattr(
        "deerflow.agents.middlewares.mem0_injection_middleware.build_mem0_injection_memory",
        lambda **kwargs: {
        "facts": [{"content": "User sources in Tianjin", "category": "context", "confidence": 0.9}]
        },
    )

    result = middleware.wrap_model_call(request, handler)

    request.override.assert_called_once()
    passed_messages = request.override.call_args.kwargs["messages"]
    assert isinstance(passed_messages[0], SystemMessage)
    assert "User sources in Tianjin" in passed_messages[0].content
    assert result == "response"


def test_mem0_injection_middleware_skips_when_no_user_id(monkeypatch):
    middleware = Mem0InjectionMiddleware()
    request = MagicMock()
    request.messages = [HumanMessage(content="hello")]
    handler = MagicMock(return_value="response")

    monkeypatch.setattr(
        "deerflow.agents.middlewares.mem0_injection_middleware.get_memory_config",
        lambda: SimpleNamespace(enabled=True, injection_enabled=True, provider="mem0", search_limit=5, max_injection_tokens=2000),
    )
    monkeypatch.setattr(
        "deerflow.agents.middlewares.mem0_injection_middleware.get_config",
        lambda: {"configurable": {}},
    )

    result = middleware.wrap_model_call(request, handler)

    request.override.assert_not_called()
    handler.assert_called_once_with(request)
    assert result == "response"


def test_mem0_injection_middleware_traces_injection_attempt(monkeypatch):
    middleware = Mem0InjectionMiddleware()
    request = MagicMock()
    request.messages = [HumanMessage(content="Need Tianjin machining suppliers")]
    request.override.return_value = MagicMock()
    handler = MagicMock(return_value="response")
    spans = []
    outputs = []

    class _Span:
        def __init__(self):
            self.metadata = {}

        def __enter__(self):
            spans.append("entered")
            return self

        def end(self, *, outputs=None):
            outputs = outputs or {}
            outputs.setdefault("injected", self.metadata.get("injected"))
            outputs.setdefault("facts_count", self.metadata.get("facts_count"))
            outputs.setdefault("formatted_tokens_estimate", self.metadata.get("formatted_tokens_estimate"))
            outputs_list.append(outputs)

        def __exit__(self, exc_type, exc, tb):
            return False

    outputs_list = outputs
    monkeypatch.setattr(
        "deerflow.agents.middlewares.mem0_injection_middleware.memory_trace",
        lambda *args, **kwargs: _Span(),
    )
    monkeypatch.setattr(
        "deerflow.agents.middlewares.mem0_injection_middleware.get_memory_config",
        lambda: SimpleNamespace(enabled=True, injection_enabled=True, provider="mem0", max_injection_tokens=2000),
    )
    monkeypatch.setattr(
        "deerflow.agents.middlewares.mem0_injection_middleware.get_config",
        lambda: {"configurable": {"user_id": "user-123", "thread_id": "thread-1"}},
    )
    monkeypatch.setattr(
        "deerflow.agents.middlewares.mem0_injection_middleware.build_mem0_injection_memory",
        lambda **kwargs: {"facts": [{"content": "User sources in Tianjin", "category": "context", "confidence": 0.9}]},
    )

    middleware.wrap_model_call(request, handler)

    assert spans == ["entered"]
    assert outputs[0]["injected"] is True
    assert outputs[0]["facts_count"] == 1
    assert outputs[0]["formatted_tokens_estimate"] > 0
    assert outputs[0]["full_memory_message"].startswith("<memory>")
    assert "User sources in Tianjin" in outputs[0]["full_memory_message"]


def test_mem0_injection_middleware_traces_skip_reason_when_no_memory(monkeypatch):
    middleware = Mem0InjectionMiddleware()
    request = MagicMock()
    request.messages = [HumanMessage(content="hello")]
    handler = MagicMock(return_value="response")
    outputs = []

    class _Span:
        def __init__(self):
            self.metadata = {}

        def __enter__(self):
            return self

        def end(self, *, outputs=None):
            outputs_list.append(outputs)

        def __exit__(self, exc_type, exc, tb):
            return False

    outputs_list = outputs
    monkeypatch.setattr(
        "deerflow.agents.middlewares.mem0_injection_middleware.memory_trace",
        lambda *args, **kwargs: _Span(),
    )
    monkeypatch.setattr(
        "deerflow.agents.middlewares.mem0_injection_middleware.get_memory_config",
        lambda: SimpleNamespace(enabled=True, injection_enabled=True, provider="mem0", max_injection_tokens=2000),
    )
    monkeypatch.setattr(
        "deerflow.agents.middlewares.mem0_injection_middleware.get_config",
        lambda: {"configurable": {"user_id": "user-123", "thread_id": "thread-1"}},
    )
    monkeypatch.setattr(
        "deerflow.agents.middlewares.mem0_injection_middleware.build_mem0_injection_memory",
        lambda **kwargs: None,
    )

    result = middleware.wrap_model_call(request, handler)

    assert result == "response"
    assert outputs == [{"injected": False, "facts_count": 0, "formatted_tokens_estimate": 0, "skip_reason": "no_memory", "full_memory_message": ""}]
