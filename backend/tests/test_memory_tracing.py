from contextlib import nullcontext
from types import SimpleNamespace
from uuid import uuid4

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


def test_memory_trace_uses_langfuse_when_enabled(monkeypatch):
    start_calls = []
    updates = []
    endings = []

    class _FakeLangfuseSpan:
        def update(self, **kwargs):
            updates.append(kwargs)

        def end(self):
            endings.append(True)

    fake_langfuse_span = _FakeLangfuseSpan()

    class _FakeContext:
        def __enter__(self):
            return fake_langfuse_span

        def __exit__(self, exc_type, exc, tb):
            return False

    class _FakeLangfuseClient:
        def start_as_current_observation(self, **kwargs):
            start_calls.append(kwargs)
            return _FakeContext()

    monkeypatch.setattr(memory_tracing, "get_enabled_tracing_providers", lambda: ["langfuse"])
    monkeypatch.setattr(memory_tracing, "_get_langfuse_client", lambda: _FakeLangfuseClient())

    with memory_tracing.memory_trace(
        "Mem0InjectionMiddleware.before_model.query_retrieval",
        thread_id="thread-5",
        user_id="user-456",
        tags=["memory", "mem0", "retrieval"],
        metadata={"query_results": 2},
        inputs={"input_message_count": 1},
    ) as span:
        span.metadata["query_kept"] = 1
        span.end(outputs={"messages": [{"type": "memory", "content": "User likes tea"}]})

    assert start_calls == [
        {
            "name": "Mem0InjectionMiddleware.before_model.query_retrieval",
            "as_type": "chain",
            "input": {"input_message_count": 1},
            "metadata": {
                "memory_provider": "mem0",
                "query_results": 2,
                "thread_id": "thread-5",
                "memory_scope": "user",
                "user_scope_key": span.metadata["user_scope_key"],
            },
            "end_on_exit": False,
        }
    ]
    assert updates == [
        {
            "output": {"messages": [{"type": "memory", "content": "User likes tea"}]},
            "metadata": {
                "memory_provider": "mem0",
                "query_results": 2,
                "thread_id": "thread-5",
                "memory_scope": "user",
                "user_scope_key": span.metadata["user_scope_key"],
                "query_kept": 1,
            },
        }
    ]
    assert endings == [True]


def test_memory_trace_reports_to_langsmith_and_langfuse_when_both_enabled(monkeypatch):
    langsmith_calls = []
    langsmith_ends = []
    langfuse_starts = []
    langfuse_updates = []
    langfuse_ends = []

    class _FakeLangSmithTrace:
        def __init__(self, *args, **kwargs):
            self.metadata = dict(kwargs["metadata"])
            langsmith_calls.append(kwargs)

        def __enter__(self):
            return self

        def end(self, *, outputs=None):
            langsmith_ends.append({"metadata": dict(self.metadata), "outputs": outputs})

        def __exit__(self, exc_type, exc, tb):
            return False

    class _FakeLangfuseSpan:
        def update(self, **kwargs):
            langfuse_updates.append(kwargs)

        def end(self):
            langfuse_ends.append(True)

    fake_langfuse_span = _FakeLangfuseSpan()

    class _FakeLangfuseContext:
        def __enter__(self):
            return fake_langfuse_span

        def __exit__(self, exc_type, exc, tb):
            return False

    class _FakeLangfuseClient:
        def start_as_current_observation(self, **kwargs):
            langfuse_starts.append(kwargs)
            return _FakeLangfuseContext()

    monkeypatch.setattr(memory_tracing, "get_enabled_tracing_providers", lambda: ["langsmith", "langfuse"])
    monkeypatch.setattr(memory_tracing, "trace", _FakeLangSmithTrace)
    monkeypatch.setattr(memory_tracing, "_get_langfuse_client", lambda: _FakeLangfuseClient())

    with memory_tracing.memory_trace(
        "MemoryUpdater.update_memory",
        thread_id="thread-9",
        user_id="user-abc",
        metadata={"prepared_message_count": 2},
        inputs={"messages": [{"type": "user", "content": "hello"}]},
    ) as span:
        span.metadata["accepted"] = True
        span.end(outputs={"messages": [{"type": "user", "content": "hello"}]})

    assert langsmith_calls[0]["metadata"]["prepared_message_count"] == 2
    assert langsmith_ends == [
        {
            "metadata": {
                "memory_provider": "mem0",
                "prepared_message_count": 2,
                "thread_id": "thread-9",
                "memory_scope": "user",
                "user_scope_key": langsmith_ends[0]["metadata"]["user_scope_key"],
                "accepted": True,
            },
            "outputs": {"messages": [{"type": "user", "content": "hello"}]},
        }
    ]
    assert langfuse_starts[0]["name"] == "MemoryUpdater.update_memory"
    assert langfuse_starts[0]["metadata"]["prepared_message_count"] == 2
    assert langfuse_updates == [
        {
            "output": {"messages": [{"type": "user", "content": "hello"}]},
            "metadata": {
                "memory_provider": "mem0",
                "prepared_message_count": 2,
                "thread_id": "thread-9",
                "memory_scope": "user",
                "user_scope_key": langfuse_updates[0]["metadata"]["user_scope_key"],
                "accepted": True,
            },
        }
    ]
    assert langfuse_ends == [True]


def test_memory_trace_skips_langfuse_trace_context_for_uuid_parent(monkeypatch):
    start_calls = []

    class _FakeLangfuseSpan:
        def update(self, **kwargs):
            return None

        def end(self):
            return None

    class _FakeContext:
        def __enter__(self):
            return _FakeLangfuseSpan()

        def __exit__(self, exc_type, exc, tb):
            return False

    class _FakeLangfuseClient:
        def start_as_current_observation(self, **kwargs):
            start_calls.append(kwargs)
            return _FakeContext()

    parent = SimpleNamespace(trace_id=uuid4(), id=uuid4())

    monkeypatch.setattr(memory_tracing, "get_enabled_tracing_providers", lambda: ["langfuse"])
    monkeypatch.setattr(memory_tracing, "_get_langfuse_client", lambda: _FakeLangfuseClient())

    with memory_tracing.memory_trace(
        "Mem0InjectionMiddleware.before_model.query_retrieval",
        thread_id="thread-uuid",
        user_id="user-uuid",
        parent=parent,
    ):
        pass

    assert len(start_calls) == 1
    assert "trace_context" not in start_calls[0]
