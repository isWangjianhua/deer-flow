# Mem0 Retrieval Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the current Mem0 runtime memory path from recent-window-only retrieval to a two-channel retrieval policy that supports profile retrieval, first-turn retrieval, conversation-aware retrieval, and graceful cold start.

**Architecture:** Keep Mem0 as the storage and semantic search backend, but move retrieval policy out of `Mem0InjectionMiddleware` into a dedicated memory-retrieval module. The middleware becomes thin orchestration only. Retrieval will merge two sources: a small profile slice from `get_all(user_id)` and a task-relevant slice from `search(query, filters={"user_id": ...})`, then deduplicate and token-budget the result before injecting it as a `SystemMessage`.

**Tech Stack:** Python 3.12, LangGraph agent middleware, Mem0 OSS Python SDK, pytest, existing DeerFlow compatibility memory formatter

---

## File Structure

Planned files and responsibilities:

- Create: `backend/packages/harness/deerflow/agents/memory/memory_retrieval.py`
  Owns retrieval policy decisions: first-turn detection, profile/query retrieval, deduplication, and compatibility payload generation.
- Modify: `backend/packages/harness/deerflow/config/memory_config.py`
  Adds retrieval-policy configuration knobs with conservative defaults.
- Modify: `backend/packages/harness/deerflow/agents/memory/mem0_service.py`
  Keeps Mem0 adapter thin; only support methods needed by the retrieval policy.
- Modify: `backend/packages/harness/deerflow/agents/middlewares/mem0_injection_middleware.py`
  Becomes an orchestrator that calls the retrieval policy and injects the result.
- Modify: `backend/packages/harness/deerflow/agents/memory/__init__.py`
  Export the new retrieval module APIs.
- Create: `backend/tests/test_mem0_retrieval.py`
  Covers cold start, first-turn retrieval, multi-turn retrieval, deduplication, and budget split.
- Modify: `backend/tests/test_mem0_injection_middleware.py`
  Adjust middleware tests to assert delegation to the retrieval policy rather than inline query logic.
- Modify: `backend/CLAUDE.md`
  Document the new retrieval policy split and config knobs.
- Modify: `README.md`
  Document the user-facing Mem0 runtime behavior at a high level.

## Task 1: Add retrieval-policy configuration knobs

**Files:**
- Modify: `backend/packages/harness/deerflow/config/memory_config.py`
- Test: `backend/tests/test_mem0_retrieval.py`

- [ ] **Step 1: Write the failing config test**

```python
from deerflow.config.memory_config import MemoryConfig


def test_memory_config_exposes_mem0_retrieval_policy_defaults():
    config = MemoryConfig(provider="mem0")

    assert config.profile_limit == 4
    assert config.query_window_turns == 3
    assert config.profile_budget_ratio == 0.3
    assert config.profile_categories == ["preference", "context", "knowledge"]
```

- [ ] **Step 2: Run the new test to verify it fails**

Run: `cd backend && PYTHONPATH=. uv run pytest tests/test_mem0_retrieval.py::test_memory_config_exposes_mem0_retrieval_policy_defaults -q`
Expected: FAIL because these fields do not exist yet.

- [ ] **Step 3: Implement the new config fields**

```python
class MemoryConfig(BaseModel):
    ...
    profile_limit: int = Field(
        default=4,
        ge=1,
        le=20,
        description="Maximum number of profile memories considered before formatting.",
    )
    query_window_turns: int = Field(
        default=3,
        ge=1,
        le=10,
        description="Maximum number of recent human turns used to build the semantic retrieval query.",
    )
    profile_budget_ratio: float = Field(
        default=0.3,
        ge=0.0,
        le=1.0,
        description="Fraction of max memory-injection budget reserved for profile memories.",
    )
    profile_categories: list[str] = Field(
        default_factory=lambda: ["preference", "context", "knowledge"],
        description="Mem0 fact categories eligible for profile retrieval.",
    )
```

- [ ] **Step 4: Run the test again**

Run: `cd backend && PYTHONPATH=. uv run pytest tests/test_mem0_retrieval.py::test_memory_config_exposes_mem0_retrieval_policy_defaults -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/packages/harness/deerflow/config/memory_config.py backend/tests/test_mem0_retrieval.py
git commit -m "feat: add mem0 retrieval policy config"
```

## Task 2: Create a dedicated retrieval-policy module

**Files:**
- Create: `backend/packages/harness/deerflow/agents/memory/memory_retrieval.py`
- Create: `backend/tests/test_mem0_retrieval.py`

- [ ] **Step 1: Write the failing cold-start and first-turn tests**

```python
from langchain_core.messages import HumanMessage

from deerflow.agents.memory.memory_retrieval import build_mem0_injection_memory


def test_build_mem0_injection_memory_returns_none_for_cold_start(monkeypatch):
    service = MagicMock()
    service.get_all.return_value = []
    service.search.return_value = []

    monkeypatch.setattr(
        "deerflow.agents.memory.memory_retrieval.get_mem0_service",
        lambda: service,
    )
    monkeypatch.setattr(
        "deerflow.agents.memory.memory_retrieval.get_memory_config",
        lambda: MemoryConfig(provider="mem0"),
    )

    result = build_mem0_injection_memory(
        user_id="user-123",
        messages=[HumanMessage(content="hello")],
    )

    assert result is None


def test_build_mem0_injection_memory_merges_profile_and_first_turn_results(monkeypatch):
    service = MagicMock()
    service.get_all.return_value = [
        {"id": "p1", "memory": "User works in semiconductor sourcing", "score": 0.91, "metadata": {"category": "context"}},
    ]
    service.search.return_value = [
        {"id": "q1", "memory": "User is looking for Tianjin machining suppliers", "score": 0.95, "metadata": {"category": "goal"}},
    ]

    monkeypatch.setattr(
        "deerflow.agents.memory.memory_retrieval.get_mem0_service",
        lambda: service,
    )
    monkeypatch.setattr(
        "deerflow.agents.memory.memory_retrieval.get_memory_config",
        lambda: MemoryConfig(provider="mem0"),
    )

    result = build_mem0_injection_memory(
        user_id="user-123",
        messages=[HumanMessage(content="Need Tianjin machining suppliers")],
    )

    facts = result["facts"]
    assert {fact["content"] for fact in facts} == {
        "User works in semiconductor sourcing",
        "User is looking for Tianjin machining suppliers",
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && PYTHONPATH=. uv run pytest tests/test_mem0_retrieval.py -q`
Expected: FAIL because `memory_retrieval.py` does not exist yet.

- [ ] **Step 3: Implement the retrieval-policy module**

```python
from __future__ import annotations

from langchain_core.messages import BaseMessage

from deerflow.agents.memory.mem0_service import get_mem0_service
from deerflow.config.memory_config import get_memory_config


def build_mem0_injection_memory(*, user_id: str, messages: list[BaseMessage]) -> dict | None:
    config = get_memory_config()
    service = get_mem0_service()

    profile_results = _select_profile_results(service.get_all(user_id=user_id), config)
    query = _build_query(messages, config.query_window_turns)
    query_results = service.search(query=query, user_id=user_id, limit=config.search_limit) if query else []

    merged = _merge_results(
        profile_results=profile_results,
        query_results=query_results,
        profile_budget_ratio=config.profile_budget_ratio,
        max_tokens=config.max_injection_tokens,
    )
    if not merged:
        return None
    return _build_compat_memory_from_results(merged)
```

```python
def _build_query(messages: list[BaseMessage], window_turns: int) -> str:
    ...


def _select_profile_results(results: list[dict], config: MemoryConfig) -> list[dict]:
    ...


def _merge_results(...):
    ...
```

- [ ] **Step 4: Run the retrieval-policy tests again**

Run: `cd backend && PYTHONPATH=. uv run pytest tests/test_mem0_retrieval.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/packages/harness/deerflow/agents/memory/memory_retrieval.py backend/tests/test_mem0_retrieval.py
git commit -m "feat: add mem0 retrieval policy module"
```

## Task 3: Refactor the Mem0 injection middleware to delegate

**Files:**
- Modify: `backend/packages/harness/deerflow/agents/middlewares/mem0_injection_middleware.py`
- Modify: `backend/tests/test_mem0_injection_middleware.py`

- [ ] **Step 1: Write the failing delegation test**

```python
def test_mem0_injection_middleware_delegates_to_retrieval_policy(monkeypatch):
    middleware = Mem0InjectionMiddleware()
    request = MagicMock()
    request.messages = [HumanMessage(content="Need Tianjin suppliers")]
    patched_request = MagicMock()
    request.override.return_value = patched_request
    handler = MagicMock(return_value="response")

    monkeypatch.setattr(
        "deerflow.agents.middlewares.mem0_injection_middleware.get_memory_config",
        lambda: SimpleNamespace(enabled=True, injection_enabled=True, provider="mem0", max_injection_tokens=2000),
    )
    monkeypatch.setattr(
        "deerflow.agents.middlewares.mem0_injection_middleware.get_config",
        lambda: {"configurable": {"user_id": "user-123"}},
    )
    monkeypatch.setattr(
        "deerflow.agents.middlewares.mem0_injection_middleware.build_mem0_injection_memory",
        lambda **kwargs: {"facts": [{"content": "User sources in Tianjin", "category": "context", "confidence": 0.9}]},
    )

    middleware.wrap_model_call(request, handler)

    request.override.assert_called_once()
```

- [ ] **Step 2: Run the middleware test to verify it fails**

Run: `cd backend && PYTHONPATH=. uv run pytest tests/test_mem0_injection_middleware.py -q`
Expected: FAIL because middleware still owns retrieval logic directly.

- [ ] **Step 3: Refactor the middleware**

```python
from deerflow.agents.memory.memory_retrieval import build_mem0_injection_memory


class Mem0InjectionMiddleware(AgentMiddleware[AgentState]):
    def _build_injection_message(self, request: ModelRequest) -> SystemMessage | None:
        ...
        compat_memory = build_mem0_injection_memory(
            user_id=user_id,
            messages=request.messages,
        )
        if compat_memory is None:
            return None
        memory_content = format_memory_for_injection(...)
```

- [ ] **Step 4: Run the middleware test again**

Run: `cd backend && PYTHONPATH=. uv run pytest tests/test_mem0_injection_middleware.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/packages/harness/deerflow/agents/middlewares/mem0_injection_middleware.py backend/tests/test_mem0_injection_middleware.py
git commit -m "refactor: delegate mem0 injection to retrieval policy"
```

## Task 4: Export and document the retrieval-policy surface

**Files:**
- Modify: `backend/packages/harness/deerflow/agents/memory/__init__.py`
- Modify: `backend/CLAUDE.md`
- Modify: `README.md`

- [ ] **Step 1: Write the failing export test**

```python
def test_memory_package_exports_mem0_retrieval_policy():
    from deerflow.agents import memory as memory_pkg

    assert hasattr(memory_pkg, "build_mem0_injection_memory")
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && PYTHONPATH=. uv run pytest tests/test_mem0_retrieval.py::test_memory_package_exports_mem0_retrieval_policy -q`
Expected: FAIL because `__init__.py` does not export it yet.

- [ ] **Step 3: Export the retrieval-policy API and update docs**

```python
from deerflow.agents.memory.memory_retrieval import build_mem0_injection_memory

__all__ = [
    ...
    "build_mem0_injection_memory",
]
```

Update docs to state:

- Mem0 retrieval now uses profile + query retrieval
- first-turn and multi-turn behavior differ
- cold start injects nothing but still writes back after the run

- [ ] **Step 4: Run the export test again**

Run: `cd backend && PYTHONPATH=. uv run pytest tests/test_mem0_retrieval.py::test_memory_package_exports_mem0_retrieval_policy -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/packages/harness/deerflow/agents/memory/__init__.py backend/CLAUDE.md README.md backend/tests/test_mem0_retrieval.py
git commit -m "docs: describe mem0 retrieval policy"
```

## Task 5: Run focused verification

**Files:**
- Test: `backend/tests/test_mem0_retrieval.py`
- Test: `backend/tests/test_mem0_injection_middleware.py`
- Test: `backend/tests/test_memory_updater.py`
- Test: `backend/tests/test_lead_agent_prompt.py`
- Test: `backend/tests/test_lead_agent_model_resolution.py`

- [ ] **Step 1: Run the focused backend test suite**

Run:

```bash
cd backend && PYTHONPATH=. uv run pytest \
  tests/test_mem0_retrieval.py \
  tests/test_mem0_injection_middleware.py \
  tests/test_memory_updater.py \
  tests/test_lead_agent_prompt.py \
  tests/test_lead_agent_model_resolution.py \
  -q
```

Expected: PASS with zero failures.

- [ ] **Step 2: Run lint on touched backend files**

Run:

```bash
cd backend && uvx ruff check \
  packages/harness/deerflow/config/memory_config.py \
  packages/harness/deerflow/agents/memory/memory_retrieval.py \
  packages/harness/deerflow/agents/middlewares/mem0_injection_middleware.py \
  packages/harness/deerflow/agents/memory/__init__.py \
  tests/test_mem0_retrieval.py \
  tests/test_mem0_injection_middleware.py
```

Expected: `All checks passed!`

- [ ] **Step 3: Commit**

```bash
git add backend/packages/harness/deerflow/config/memory_config.py \
  backend/packages/harness/deerflow/agents/memory/memory_retrieval.py \
  backend/packages/harness/deerflow/agents/middlewares/mem0_injection_middleware.py \
  backend/packages/harness/deerflow/agents/memory/__init__.py \
  backend/tests/test_mem0_retrieval.py \
  backend/tests/test_mem0_injection_middleware.py \
  backend/CLAUDE.md \
  README.md
git commit -m "feat: add mem0 profile and query retrieval policy"
```
