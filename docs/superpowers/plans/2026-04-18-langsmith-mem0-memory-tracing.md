# LangSmith Mem0 Memory Tracing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add LangSmith-visible Mem0 memory spans for retrieval, injection, queueing, and write-back while preserving existing runtime behavior.

**Architecture:** Introduce a tiny tracing helper in `deerflow.tracing.memory` that wraps LangSmith's `trace(...)` context manager and centralizes memory tags/metadata. Instrument only the Mem0 boundary points (`Mem0InjectionMiddleware`, `memory_retrieval.py`, `MemoryMiddleware`, `MemoryUpdater`, `Mem0Service`) so the top-level agent trace gains visible child spans without changing the memory pipeline itself.

**Tech Stack:** Python 3.12, LangSmith SDK, LangChain/LangGraph, pytest

---

## File Structure

- Create: `backend/packages/harness/deerflow/tracing/memory.py`
  - Thin helper for `trace(...)`, deterministic `user_scope_key`, tag/metadata normalization, and no-op fallback when tracing is disabled.
- Modify: `backend/packages/harness/deerflow/tracing/__init__.py`
  - Re-export memory tracing helpers for consistent imports.
- Modify: `backend/packages/harness/deerflow/agents/middlewares/mem0_injection_middleware.py`
  - Add the parent `memory.mem0.middleware.injection` span.
- Modify: `backend/packages/harness/deerflow/agents/memory/memory_retrieval.py`
  - Add `profile_retrieval`, `query_retrieval`, and `merge` spans.
- Modify: `backend/packages/harness/deerflow/agents/middlewares/memory_middleware.py`
  - Add `memory.mem0.middleware.after_agent` span with queued/skip details.
- Modify: `backend/packages/harness/deerflow/agents/memory/updater.py`
  - Add `memory.mem0.write` span in the Mem0 write path.
- Modify: `backend/packages/harness/deerflow/agents/memory/mem0_service.py`
  - Add `memory.mem0.add_conversation` span at the SDK boundary.
- Create: `backend/tests/test_memory_tracing.py`
  - Focused tests for helper behavior and emitted metadata.
- Modify: `backend/tests/test_mem0_injection_middleware.py`
  - Assert injection span usage and metadata.
- Modify: `backend/tests/test_memory_middleware.py`
  - Assert queue/skip span behavior.
- Modify: `backend/tests/test_memory_updater.py`
  - Assert `memory.mem0.write` span behavior.
- Modify: `backend/tests/test_mem0_service.py`
  - Assert `memory.mem0.add_conversation` span behavior.

---

### Task 1: Add the shared memory tracing helper

**Files:**
- Create: `backend/packages/harness/deerflow/tracing/memory.py`
- Modify: `backend/packages/harness/deerflow/tracing/__init__.py`
- Test: `backend/tests/test_memory_tracing.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_memory_tracing.py` with these tests:

```python
from contextlib import nullcontext
from types import SimpleNamespace

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `UV_CACHE_DIR=.tmp/uv-cache uv run pytest tests/test_memory_tracing.py -q`
Expected: FAIL because `deerflow.tracing.memory` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `backend/packages/harness/deerflow/tracing/memory.py` with this code:

```python
from __future__ import annotations

import hashlib
from contextlib import nullcontext
from typing import Any

from langsmith.run_helpers import trace

from deerflow.config import get_enabled_tracing_providers


def build_user_scope_key(user_id: str | None) -> str | None:
    if not user_id:
        return None
    digest = hashlib.sha256(user_id.encode("utf-8")).hexdigest()[:12]
    return f"usr_{digest}"


def memory_trace(
    name: str,
    *,
    thread_id: str | None = None,
    user_id: str | None = None,
    tags: list[str] | None = None,
    metadata: dict[str, Any] | None = None,
):
    if "langsmith" not in get_enabled_tracing_providers():
        return nullcontext()

    merged_metadata: dict[str, Any] = {"memory_provider": "mem0", **(metadata or {})}
    if thread_id:
        merged_metadata["thread_id"] = thread_id
    user_scope_key = build_user_scope_key(user_id)
    if user_scope_key:
        merged_metadata["memory_scope"] = "user"
        merged_metadata["user_scope_key"] = user_scope_key

    return trace(
        name,
        run_type="chain",
        tags=tags or ["memory", "mem0"],
        metadata=merged_metadata,
    )
```

Update `backend/packages/harness/deerflow/tracing/__init__.py` to:

```python
from .factory import build_tracing_callbacks
from .memory import build_user_scope_key, memory_trace

__all__ = ["build_tracing_callbacks", "build_user_scope_key", "memory_trace"]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `UV_CACHE_DIR=.tmp/uv-cache uv run pytest tests/test_memory_tracing.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/packages/harness/deerflow/tracing/__init__.py backend/packages/harness/deerflow/tracing/memory.py backend/tests/test_memory_tracing.py
git commit -m "feat: add langsmith memory tracing helper"
```

### Task 2: Instrument Mem0 retrieval and injection spans

**Files:**
- Modify: `backend/packages/harness/deerflow/agents/middlewares/mem0_injection_middleware.py`
- Modify: `backend/packages/harness/deerflow/agents/memory/memory_retrieval.py`
- Modify: `backend/tests/test_mem0_injection_middleware.py`
- Modify: `backend/tests/test_memory_tracing.py`

- [ ] **Step 1: Write the failing tests**

Add these tests.

To `backend/tests/test_mem0_injection_middleware.py`:

```python
def test_mem0_injection_middleware_traces_injection_attempt(monkeypatch):
    middleware = Mem0InjectionMiddleware()
    request = MagicMock()
    request.messages = [HumanMessage(content="Need Tianjin machining suppliers")]
    request.override.return_value = MagicMock()
    handler = MagicMock(return_value="response")
    spans = []

    class _Span:
        def __enter__(self):
            spans.append("entered")
            return self
        def __exit__(self, exc_type, exc, tb):
            return False

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
```

To `backend/tests/test_memory_tracing.py`:

```python
from deerflow.agents.memory.memory_retrieval import build_mem0_injection_memory
from deerflow.config.memory_config import MemoryConfig


def test_build_mem0_injection_memory_traces_profile_query_and_merge(monkeypatch):
    span_names = []

    class _Span:
        def __init__(self, name):
            self.name = name
        def __enter__(self):
            span_names.append(self.name)
            return self
        def __exit__(self, exc_type, exc, tb):
            return False

    service = SimpleNamespace(
        get_all=lambda user_id, limit=None: [{"id": "1", "memory": "User likes concise summaries", "score": 0.9, "metadata": {"category": "preference"}, "created_at": "2026-04-18T00:00:00Z"}],
        search=lambda query, user_id, limit=None: [{"id": "2", "memory": "User sources in Tianjin", "score": 0.8, "metadata": {"category": "context"}, "created_at": "2026-04-18T00:00:00Z"}],
    )

    monkeypatch.setattr("deerflow.agents.memory.memory_retrieval.memory_trace", lambda name, **kwargs: _Span(name))
    monkeypatch.setattr("deerflow.agents.memory.memory_retrieval.get_mem0_service", lambda: service)
    monkeypatch.setattr("deerflow.agents.memory.memory_retrieval.get_memory_config", lambda: MemoryConfig(provider="mem0"))

    build_mem0_injection_memory(user_id="user-123", messages=[SimpleNamespace(type="human", content="Need Tianjin machining suppliers")], thread_id="thread-1")

    assert span_names == [
        "memory.mem0.profile_retrieval",
        "memory.mem0.query_retrieval",
        "memory.mem0.merge",
    ]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `UV_CACHE_DIR=.tmp/uv-cache uv run pytest tests/test_mem0_injection_middleware.py tests/test_memory_tracing.py -q`
Expected: FAIL because the middleware/retrieval code does not yet call `memory_trace(...)` and `build_mem0_injection_memory(...)` does not accept `thread_id`.

- [ ] **Step 3: Write minimal implementation**

Update `backend/packages/harness/deerflow/agents/middlewares/mem0_injection_middleware.py`:

```python
from deerflow.tracing import memory_trace

...
    def _build_injection_message(self, request: ModelRequest) -> SystemMessage | None:
        ...
        thread_id = configurable.get("thread_id")
        with memory_trace(
            "memory.mem0.middleware.injection",
            thread_id=thread_id,
            user_id=user_id,
            tags=["memory", "mem0", "injection", "middleware"],
            metadata={"input_message_count": len(request.messages)},
        ):
            compat_memory = build_mem0_injection_memory(
                user_id=user_id,
                messages=request.messages,
                thread_id=thread_id,
            )
            ...
```

Update `backend/packages/harness/deerflow/agents/memory/memory_retrieval.py`:

```python
from deerflow.tracing import memory_trace

...
def build_mem0_injection_memory(*, user_id: str, messages: list[Any], thread_id: str | None = None) -> dict[str, Any] | None:
    config = get_memory_config()
    service = get_mem0_service()

    with memory_trace(
        "memory.mem0.profile_retrieval",
        thread_id=thread_id,
        user_id=user_id,
        tags=["memory", "mem0", "retrieval", "profile"],
        metadata={"profile_limit": config.profile_limit, "profile_categories": list(config.profile_categories)},
    ):
        profile_results = _profile_candidates(service.get_all(user_id=user_id))

    query = _build_query(messages, config.query_window_turns)
    with memory_trace(
        "memory.mem0.query_retrieval",
        thread_id=thread_id,
        user_id=user_id,
        tags=["memory", "mem0", "retrieval", "query"],
        metadata={"query_window_turns": config.query_window_turns, "query_length": len(query), "query_preview": query[:120]},
    ):
        query_results = service.search(query=query, user_id=user_id, limit=config.search_limit) if query else []

    ...

    with memory_trace(
        "memory.mem0.merge",
        thread_id=thread_id,
        user_id=user_id,
        tags=["memory", "mem0", "merge"],
        metadata={
            "profile_input_count": len(bounded_profile),
            "query_input_count": len(bounded_query),
            "profile_budget_tokens": profile_budget,
            "query_budget_tokens": query_budget,
        },
    ):
        merged = _dedupe_results(bounded_query, bounded_profile)
        return _compat_memory(merged)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `UV_CACHE_DIR=.tmp/uv-cache uv run pytest tests/test_mem0_injection_middleware.py tests/test_memory_tracing.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/packages/harness/deerflow/agents/middlewares/mem0_injection_middleware.py backend/packages/harness/deerflow/agents/memory/memory_retrieval.py backend/tests/test_mem0_injection_middleware.py backend/tests/test_memory_tracing.py
git commit -m "feat: trace mem0 retrieval and injection"
```

### Task 3: Instrument queueing and Mem0 write spans

**Files:**
- Modify: `backend/packages/harness/deerflow/agents/middlewares/memory_middleware.py`
- Modify: `backend/packages/harness/deerflow/agents/memory/updater.py`
- Modify: `backend/packages/harness/deerflow/agents/memory/mem0_service.py`
- Modify: `backend/tests/test_memory_middleware.py`
- Modify: `backend/tests/test_memory_updater.py`
- Modify: `backend/tests/test_mem0_service.py`

- [ ] **Step 1: Write the failing tests**

Add these tests.

To `backend/tests/test_memory_middleware.py`:

```python
def test_memory_middleware_traces_mem0_queue_decision(monkeypatch):
    middleware = MemoryMiddleware(agent_name=None)
    state = {"messages": [HumanMessage(content="hello"), AIMessage(content="hi")]}
    runtime = SimpleNamespace(context={"thread_id": "thread-1"})
    queue = SimpleNamespace(add=MagicMock())
    traced = []

    class _Span:
        def __enter__(self):
            traced.append(True)
            return self
        def __exit__(self, exc_type, exc, tb):
            return False

    monkeypatch.setattr("deerflow.agents.middlewares.memory_middleware.memory_trace", lambda *args, **kwargs: _Span())
    monkeypatch.setattr("deerflow.agents.middlewares.memory_middleware.get_memory_config", lambda: SimpleNamespace(enabled=True, write_enabled=True, provider="mem0"))
    monkeypatch.setattr("deerflow.agents.middlewares.memory_middleware.get_config", lambda: {"configurable": {"user_id": "user-123", "thread_id": "thread-1"}})
    monkeypatch.setattr("deerflow.agents.middlewares.memory_middleware.filter_messages_for_memory", lambda messages: messages)
    monkeypatch.setattr("deerflow.agents.middlewares.memory_middleware.detect_correction", lambda messages: False)
    monkeypatch.setattr("deerflow.agents.middlewares.memory_middleware.detect_reinforcement", lambda messages: False)
    monkeypatch.setattr("deerflow.agents.middlewares.memory_middleware.get_memory_queue", lambda: queue)

    middleware.after_agent(state, runtime)

    assert traced == [True]
```

To `backend/tests/test_memory_updater.py` near the existing Mem0 test:

```python
def test_memory_updater_traces_mem0_write(monkeypatch):
    updater = MemoryUpdater()
    service = MagicMock()
    traced = []

    class _Span:
        def __enter__(self):
            traced.append(True)
            return self
        def __exit__(self, exc_type, exc, tb):
            return False

    monkeypatch.setattr("deerflow.agents.memory.updater.memory_trace", lambda *args, **kwargs: _Span())
    monkeypatch.setattr("deerflow.agents.memory.updater.get_memory_config", lambda: _memory_config(enabled=True, provider="mem0"))
    monkeypatch.setattr("deerflow.agents.memory.updater.get_mem0_service", lambda: service)

    updater.update_memory(messages=["conversation"], thread_id="thread-1", user_id="user-123")

    assert traced == [True]
```

To `backend/tests/test_mem0_service.py`:

```python
def test_add_conversation_traces_mem0_sdk_boundary(monkeypatch):
    service = Mem0Service()
    fake = _FakeMem0Client()
    service._client = fake
    traced = []

    class _Span:
        def __enter__(self):
            traced.append(True)
            return self
        def __exit__(self, exc_type, exc, tb):
            return False

    monkeypatch.setattr("deerflow.agents.memory.mem0_service.memory_trace", lambda *args, **kwargs: _Span())

    class _Message:
        type = "human"
        content = "remember this"

    service.add_conversation(messages=[_Message()], user_id="user_a", run_id="thread_a", metadata={"source": "thread_a"})

    assert traced == [True]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `UV_CACHE_DIR=.tmp/uv-cache uv run pytest tests/test_memory_middleware.py tests/test_memory_updater.py tests/test_mem0_service.py -q`
Expected: FAIL because these modules do not yet import or call `memory_trace(...)`.

- [ ] **Step 3: Write minimal implementation**

Update `backend/packages/harness/deerflow/agents/middlewares/memory_middleware.py`:

```python
from deerflow.tracing import memory_trace

...
        with memory_trace(
            "memory.mem0.middleware.after_agent",
            thread_id=thread_id,
            user_id=user_id,
            tags=["memory", "mem0", "write", "middleware"],
            metadata={
                "message_count": len(messages),
                "filtered_message_count": len(filtered_messages),
                "correction_detected": correction_detected,
                "reinforcement_detected": reinforcement_detected,
                "queued": True,
            },
        ):
            queue.add(...)
```

Update `backend/packages/harness/deerflow/agents/memory/updater.py`:

```python
from deerflow.tracing import memory_trace

...
            if config.provider == "mem0":
                ...
                with memory_trace(
                    "memory.mem0.write",
                    thread_id=thread_id,
                    user_id=user_id,
                    tags=["memory", "mem0", "write"],
                    metadata={"message_count": len(messages), "mode": "conversation_add"},
                ):
                    get_mem0_service().add_conversation(
                        messages=messages,
                        user_id=user_id,
                        run_id=thread_id,
                        metadata={"thread_id": thread_id or "", "source": thread_id or "unknown"},
                    )
                return True
```

Update `backend/packages/harness/deerflow/agents/memory/mem0_service.py`:

```python
from deerflow.tracing import memory_trace

...
        with memory_trace(
            "memory.mem0.add_conversation",
            thread_id=run_id,
            user_id=user_id,
            tags=["memory", "mem0", "write", "sdk"],
            metadata={
                "run_id": run_id,
                "payload_count": len(payload),
                "roles": [item["role"] for item in payload],
                "has_metadata": bool(metadata),
            },
        ):
            return self._ensure_client().add(**kwargs)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `UV_CACHE_DIR=.tmp/uv-cache uv run pytest tests/test_memory_middleware.py tests/test_memory_updater.py tests/test_mem0_service.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/packages/harness/deerflow/agents/middlewares/memory_middleware.py backend/packages/harness/deerflow/agents/memory/updater.py backend/packages/harness/deerflow/agents/memory/mem0_service.py backend/tests/test_memory_middleware.py backend/tests/test_memory_updater.py backend/tests/test_mem0_service.py
git commit -m "feat: trace mem0 memory write path"
```

### Task 4: Full verification and real trace check

**Files:**
- Modify: `backend/packages/harness/deerflow/tracing/memory.py`
- Modify: `backend/packages/harness/deerflow/agents/middlewares/mem0_injection_middleware.py`
- Modify: `backend/packages/harness/deerflow/agents/memory/memory_retrieval.py`
- Modify: `backend/packages/harness/deerflow/agents/middlewares/memory_middleware.py`
- Modify: `backend/packages/harness/deerflow/agents/memory/updater.py`
- Modify: `backend/packages/harness/deerflow/agents/memory/mem0_service.py`
- Test: `backend/tests/test_memory_tracing.py`
- Test: `backend/tests/test_mem0_injection_middleware.py`
- Test: `backend/tests/test_memory_middleware.py`
- Test: `backend/tests/test_memory_updater.py`
- Test: `backend/tests/test_mem0_service.py`

- [ ] **Step 1: Run the focused automated suite**

Run: `UV_CACHE_DIR=.tmp/uv-cache uv run pytest tests/test_memory_tracing.py tests/test_mem0_injection_middleware.py tests/test_memory_middleware.py tests/test_memory_updater.py tests/test_mem0_service.py -q`
Expected: PASS

- [ ] **Step 2: Run one real LangSmith-enabled smoke flow**

Run the gateway/backend with `.env` tracing enabled, trigger one authenticated chat, then verify in LangSmith that the trace tree contains:

- `memory.mem0.middleware.injection`
- `memory.mem0.profile_retrieval`
- `memory.mem0.query_retrieval`
- `memory.mem0.merge`
- `memory.mem0.middleware.after_agent`
- `memory.mem0.write`
- `memory.mem0.add_conversation`

- [ ] **Step 3: Confirm metadata shape manually**

Check that memory spans include:

- `thread_id`
- `memory_provider=mem0`
- `user_scope_key`

Check that they do not expose:

- raw `user_id`
- full memory contents
- full message payloads

- [ ] **Step 4: Commit**

```bash
git add backend/packages/harness/deerflow/tracing/memory.py backend/packages/harness/deerflow/tracing/__init__.py backend/packages/harness/deerflow/agents/middlewares/mem0_injection_middleware.py backend/packages/harness/deerflow/agents/memory/memory_retrieval.py backend/packages/harness/deerflow/agents/middlewares/memory_middleware.py backend/packages/harness/deerflow/agents/memory/updater.py backend/packages/harness/deerflow/agents/memory/mem0_service.py backend/tests/test_memory_tracing.py backend/tests/test_mem0_injection_middleware.py backend/tests/test_memory_middleware.py backend/tests/test_memory_updater.py backend/tests/test_mem0_service.py
git commit -m "feat: add langsmith tracing for mem0 memory flow"
```
