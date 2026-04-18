from contextlib import nullcontext
from types import SimpleNamespace

from deerflow.agents.memory.memory_retrieval import build_mem0_injection_memory
from deerflow.config.memory_config import MemoryConfig
from deerflow.tracing import memory as memory_tracing


def test_memory_trace_returns_noop_context_when_tracing_disabled(monkeypatch):
    monkeypatch.setattr(memory_tracing, "get_enabled_tracing_providers", lambda: [])

    ctx = memory_tracing.memory_trace(
        "Mem0InjectionMiddleware.before_model.query_retrieval",
        thread_id="thread-1",
        user_id="user-123",
        tags=["memory", "mem0", "retrieval"],
        metadata={"query_results": 2},
    )

    assert isinstance(ctx, type(nullcontext()))


def test_memory_trace_hashes_user_scope_and_calls_langsmith_trace(monkeypatch):
    calls = []

    class _FakeTrace:
        def __init__(self, *args, **kwargs):
            calls.append(kwargs)

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

    monkeypatch.setattr(memory_tracing, "get_enabled_tracing_providers", lambda: ["langsmith"])
    monkeypatch.setattr(memory_tracing, "trace", _FakeTrace)

    with memory_tracing.memory_trace(
        "Mem0InjectionMiddleware.before_model.merge",
        thread_id="thread-9",
        user_id="user-abc",
        tags=["memory", "mem0", "merge"],
        metadata={"merged_count": 3},
    ):
        pass

    assert calls[0]["name"] == "Mem0InjectionMiddleware.before_model.merge"
    assert calls[0]["tags"] == ["memory", "mem0", "merge"]
    assert calls[0]["metadata"]["thread_id"] == "thread-9"
    assert calls[0]["metadata"]["user_scope_key"].startswith("usr_")
    assert calls[0]["metadata"]["merged_count"] == 3
    assert "user-abc" not in calls[0]["metadata"].values()


def test_build_mem0_injection_memory_traces_profile_query_and_merge(monkeypatch):
    span_names = []
    span_outputs = {}

    class _Span:
        def __init__(self, name):
            self.name = name
            self.metadata = {}

        def __enter__(self):
            span_names.append(self.name)
            return self

        def end(self, *, outputs=None):
            span_outputs[self.name] = outputs

        def __exit__(self, exc_type, exc, tb):
            return False

    service = SimpleNamespace(
        get_all=lambda user_id, limit=None: [
            {
                "id": "1",
                "memory": "User likes concise summaries",
                "score": 0.9,
                "metadata": {"category": "preference"},
                "created_at": "2026-04-18T00:00:00Z",
            }
        ],
        search=lambda query, user_id, limit=None: [
            {
                "id": "2",
                "memory": "User sources in Tianjin",
                "score": 0.8,
                "metadata": {"category": "context"},
                "created_at": "2026-04-18T00:00:00Z",
            }
        ],
    )

    span_inputs = {}

    def _memory_trace(name, **kwargs):
        span_inputs[name] = kwargs.get("inputs")
        return _Span(name)

    monkeypatch.setattr("deerflow.agents.memory.memory_retrieval.memory_trace", _memory_trace)
    monkeypatch.setattr("deerflow.agents.memory.memory_retrieval.get_mem0_service", lambda: service)
    monkeypatch.setattr("deerflow.agents.memory.memory_retrieval.get_memory_config", lambda: MemoryConfig(provider="mem0"))

    build_mem0_injection_memory(
        user_id="user-123",
        messages=[SimpleNamespace(type="human", content="Need Tianjin machining suppliers")],
        thread_id="thread-1",
    )

    assert span_names == [
        "Mem0InjectionMiddleware.before_model.profile_retrieval",
        "Mem0InjectionMiddleware.before_model.query_retrieval",
        "Mem0InjectionMiddleware.before_model.merge",
    ]
    assert span_outputs["Mem0InjectionMiddleware.before_model.profile_retrieval"]["thread_data"]["profile_kept"] == 1
    assert span_outputs["Mem0InjectionMiddleware.before_model.profile_retrieval"]["thread_data"]["uses_current_messages"] is False
    assert span_outputs["Mem0InjectionMiddleware.before_model.profile_retrieval"]["thread_data"]["retrieval_source"] == "profile_memory"
    assert span_inputs["Mem0InjectionMiddleware.before_model.profile_retrieval"]["messages"][0]["content"] == "Using user-scoped profile memory (no current request text)."
    assert span_outputs["Mem0InjectionMiddleware.before_model.profile_retrieval"]["messages"][0]["content"] == "User likes concise summaries"
    assert span_outputs["Mem0InjectionMiddleware.before_model.query_retrieval"]["thread_data"]["query_results"] == 1
    assert span_outputs["Mem0InjectionMiddleware.before_model.query_retrieval"]["thread_data"]["query_kept"] == 1
    assert span_outputs["Mem0InjectionMiddleware.before_model.query_retrieval"]["messages"][0]["content"] == "User sources in Tianjin"
    assert span_outputs["Mem0InjectionMiddleware.before_model.merge"]["thread_data"]["merged_count"] == 2
    assert span_outputs["Mem0InjectionMiddleware.before_model.merge"]["thread_data"]["deduped_count"] == 0
    assert len(span_outputs["Mem0InjectionMiddleware.before_model.merge"]["messages"]) == 2


def test_memory_trace_forwards_inputs_to_langsmith_trace(monkeypatch):
    calls = []

    class _FakeTrace:
        def __init__(self, *args, **kwargs):
            calls.append(kwargs)

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

    monkeypatch.setattr(memory_tracing, "get_enabled_tracing_providers", lambda: ["langsmith"])
    monkeypatch.setattr(memory_tracing, "trace", _FakeTrace)

    with memory_tracing.memory_trace(
        "Mem0InjectionMiddleware.before_model",
        thread_id="thread-7",
        user_id="user-xyz",
        inputs={"input_message_count": 2},
    ):
        pass

    assert calls[0]["inputs"] == {"input_message_count": 2}
