from contextlib import nullcontext
from types import SimpleNamespace

from deerflow.agents.memory.memory_retrieval import build_mem0_injection_memory
from deerflow.config.memory_config import MemoryConfig
from deerflow.tracing import memory as memory_tracing


def test_memory_trace_returns_noop_context_when_tracing_disabled(monkeypatch):
    monkeypatch.setattr(memory_tracing, "get_enabled_tracing_providers", lambda: [])

    ctx = memory_tracing.memory_trace(
        "memory.mem0.query_retrieval",
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
        "memory.mem0.merge",
        thread_id="thread-9",
        user_id="user-abc",
        tags=["memory", "mem0", "merge"],
        metadata={"merged_count": 3},
    ):
        pass

    assert calls[0]["name"] == "memory.mem0.merge"
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

    monkeypatch.setattr("deerflow.agents.memory.memory_retrieval.memory_trace", lambda name, **kwargs: _Span(name))
    monkeypatch.setattr("deerflow.agents.memory.memory_retrieval.get_mem0_service", lambda: service)
    monkeypatch.setattr("deerflow.agents.memory.memory_retrieval.get_memory_config", lambda: MemoryConfig(provider="mem0"))

    build_mem0_injection_memory(
        user_id="user-123",
        messages=[SimpleNamespace(type="human", content="Need Tianjin machining suppliers")],
        thread_id="thread-1",
    )

    assert span_names == [
        "memory.mem0.profile_retrieval",
        "memory.mem0.query_retrieval",
        "memory.mem0.merge",
    ]
    assert span_outputs["memory.mem0.profile_retrieval"]["profile_kept"] == 1
    assert span_outputs["memory.mem0.profile_retrieval"]["selected_profile_results"][0]["memory"] == "User likes concise summaries"
    assert span_outputs["memory.mem0.query_retrieval"]["query_results"] == 1
    assert span_outputs["memory.mem0.query_retrieval"]["query_kept"] == 1
    assert span_outputs["memory.mem0.query_retrieval"]["selected_query_results"][0]["memory"] == "User sources in Tianjin"
    assert span_outputs["memory.mem0.merge"]["merged_count"] == 2
    assert span_outputs["memory.mem0.merge"]["deduped_count"] == 0
    assert len(span_outputs["memory.mem0.merge"]["merged_results"]) == 2


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
        "memory.mem0.middleware.injection",
        thread_id="thread-7",
        user_id="user-xyz",
        inputs={"input_message_count": 2},
    ):
        pass

    assert calls[0]["inputs"] == {"input_message_count": 2}
