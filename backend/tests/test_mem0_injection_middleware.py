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
