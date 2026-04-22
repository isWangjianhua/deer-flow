# Agent Memory Scope Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split mem0-backed memory into `(user_id, agent_id)` spaces so main chat uses a stable lead-agent scope, each custom agent gets its own isolated scope, and `Settings > Memory` continues to expose only the lead-agent memory.

**Architecture:** Add a shared backend memory-scope resolver that maps `agent_name=None` to `__lead__` and normalized custom agents to `agent_id`, then use that resolver everywhere mem0 writes, mem0 retrieval, and Gateway `/api/memory` compatibility routes touch memory. Keep BFF `/memory` as a lead-only route by forwarding `X-Agent-Id: __lead__`, and update frontend copy/docs so the product clearly describes the visible Memory page as the lead-agent memory view.

**Tech Stack:** Python, FastAPI, mem0, Qdrant, pytest, Next.js App Router, TypeScript locale files, Node `node:test`

---

## File Map

- `backend/packages/harness/deerflow/agents/memory/scope.py`
  - New canonical resolver for `agent_name -> agent_id`, including the stable `__lead__` constant.
- `backend/packages/harness/deerflow/agents/memory/mem0_service.py`
  - Extend mem0 add/search/get_all/delete/build helpers to accept `agent_id`.
- `backend/packages/harness/deerflow/agents/memory/updater.py`
  - Use the new resolver when writing mem0 conversation updates and when serving compatibility memory operations.
- `backend/packages/harness/deerflow/agents/memory/memory_retrieval.py`
  - Query mem0 with `(user_id, agent_id)` instead of `user_id` alone.
- `backend/packages/harness/deerflow/agents/middlewares/mem0_injection_middleware.py`
  - Forward runtime `agent_name` into the mem0 retrieval builder.
- `backend/app/gateway/routers/memory.py`
  - Accept and normalize `X-Agent-Id` for mem0 compatibility routes, defaulting to `__lead__` when omitted.
- `backend/tests/test_memory_scope.py`
  - Verify the canonical lead/custom agent scope resolver.
- `backend/tests/test_mem0_service.py`
  - Verify mem0 service add/search/get_all/delete helpers now include `agent_id`.
- `backend/tests/test_memory_updater.py`
  - Verify lead/custom mem0 write scope resolution and compatibility helpers.
- `backend/tests/test_mem0_retrieval.py`
  - Verify lead/custom mem0 retrieval scope resolution.
- `backend/tests/test_mem0_injection_middleware.py`
  - Verify the middleware forwards `agent_name` into retrieval.
- `backend/tests/test_memory_router.py`
  - Verify Gateway `/api/memory*` routes forward `X-Agent-Id` and default to lead scope.
- `bff/app/core/memory_scope.py`
  - New BFF-side `__lead__` constant for the public `/memory` route.
- `bff/app/clients/deerflow.py`
  - Forward `X-Agent-Id` to Gateway memory endpoints.
- `bff/app/api/routes/memory.py`
  - Keep the public route lead-only by always calling the client with `agent_id="__lead__"`.
- `bff/tests/clients/test_deerflow_client.py`
  - Verify BFF memory requests now send both `X-User-Id` and `X-Agent-Id`.
- `bff/tests/api/test_memory_routes.py`
  - Verify `/memory` keeps returning lead scope only.
- `frontend/src/core/i18n/locales/en-US.ts`
  - Update Memory copy to state that Settings shows lead-agent memory only.
- `frontend/src/core/i18n/locales/zh-CN.ts`
  - Chinese copy for the same lead-agent Memory semantics.
- `backend/docs/API.md`
  - Document `X-Agent-Id` support for mem0 compatibility routes.
- `bff/README.md`
  - Document that BFF `/memory` exposes only lead-agent memory.
- `frontend/README.md`
  - Document that `Settings > Memory` maps to lead-agent memory while custom-agent memory remains hidden.

### Task 1: Add a canonical memory-scope resolver and mem0 `agent_id` support

**Files:**
- Create: `backend/packages/harness/deerflow/agents/memory/scope.py`
- Modify: `backend/packages/harness/deerflow/agents/memory/mem0_service.py`
- Create: `backend/tests/test_memory_scope.py`
- Modify: `backend/tests/test_mem0_service.py`
- Test: `backend/tests/test_memory_scope.py`
- Test: `backend/tests/test_mem0_service.py`

- [ ] **Step 1: Write the failing resolver and mem0 service tests**

Create `backend/tests/test_memory_scope.py`:

```python
from deerflow.agents.memory.scope import LEAD_MEMORY_AGENT_ID, resolve_memory_agent_id


def test_resolve_memory_agent_id_defaults_to_lead_scope() -> None:
    assert resolve_memory_agent_id(agent_name=None) == LEAD_MEMORY_AGENT_ID
    assert resolve_memory_agent_id(agent_name="") == LEAD_MEMORY_AGENT_ID


def test_resolve_memory_agent_id_normalizes_custom_agent_names() -> None:
    assert resolve_memory_agent_id(agent_name="Code-Test") == "code-test"
```

Add these tests to `backend/tests/test_mem0_service.py`:

```python
def test_add_conversation_sends_agent_id() -> None:
    service = Mem0Service()
    fake = _FakeMem0Client()
    service._client = fake

    class _Message:
        type = "human"
        content = "remember this"

    service.add_conversation(
        messages=[_Message()],
        user_id="user_a",
        agent_id="code-test",
        run_id="thread_a",
        metadata={"source": "thread_a"},
    )

    assert fake.add_calls[0]["agent_id"] == "code-test"
```

```python
def test_search_uses_user_and_agent_filters() -> None:
    service = Mem0Service()
    fake = _FakeMem0Client()
    service._client = fake

    service.search(query="python", user_id="user_a", agent_id="code-test", limit=3)

    assert fake.search_calls[0]["filters"] == {
        "user_id": "user_a",
        "agent_id": "code-test",
    }
```

```python
def test_get_all_uses_user_and_agent_filters() -> None:
    service = Mem0Service()
    fake = _FakeMem0Client()
    service._client = fake

    service.get_all(user_id="user_a", agent_id="__lead__")

    assert fake.get_all_calls[0]["filters"] == {
        "user_id": "user_a",
        "agent_id": "__lead__",
    }
```

- [ ] **Step 2: Run the focused backend tests to verify they fail**

Run:

```bash
cd backend && .venv/bin/python -m pytest tests/test_memory_scope.py tests/test_mem0_service.py -q
```

Expected:

- import fails because `deerflow.agents.memory.scope` does not exist
- service tests fail because `Mem0Service` methods do not accept or forward `agent_id`

- [ ] **Step 3: Implement the scope resolver and extend mem0 service signatures**

Create `backend/packages/harness/deerflow/agents/memory/scope.py`:

```python
from deerflow.config.agents_config import AGENT_NAME_PATTERN

LEAD_MEMORY_AGENT_ID = "__lead__"


def resolve_memory_agent_id(*, agent_name: str | None = None, agent_id: str | None = None) -> str:
    raw = agent_id if agent_id is not None else agent_name
    if raw is None or not str(raw).strip():
        return LEAD_MEMORY_AGENT_ID

    normalized = str(raw).strip().lower()
    if normalized != LEAD_MEMORY_AGENT_ID and not AGENT_NAME_PATTERN.match(normalized):
        raise ValueError(f"Invalid memory agent identifier: {raw!r}")
    return normalized
```

Update `backend/packages/harness/deerflow/agents/memory/mem0_service.py` so these signatures accept `agent_id` and pass it through:

```python
def add_conversation(
    self,
    *,
    messages: list[Any],
    user_id: str,
    agent_id: str | None = None,
    run_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> Any:
    kwargs: dict[str, Any] = {
        "messages": payload,
        "user_id": user_id,
    }
    if agent_id:
        kwargs["agent_id"] = agent_id
    if run_id:
        kwargs["run_id"] = run_id
    if metadata:
        kwargs["metadata"] = metadata
```

```python
def search(self, *, query: str, user_id: str, agent_id: str, limit: int | None = None) -> list[dict[str, Any]]:
    result = self._ensure_client().search(
        query=query,
        top_k=effective_limit,
        filters={"user_id": user_id, "agent_id": agent_id},
    )
```

```python
def get_all(self, *, user_id: str, agent_id: str, limit: int | None = None) -> list[dict[str, Any]]:
    result = self._ensure_client().get_all(
        filters={"user_id": user_id, "agent_id": agent_id},
        top_k=effective_limit,
    )
```

Also update:

- `delete_all(self, *, user_id: str, agent_id: str) -> Any`
- `build_compat_memory(self, *, user_id: str, agent_id: str) -> dict[str, Any]`
- `build_compat_memory_from_search(self, *, user_id: str, agent_id: str, query: str, limit: int | None = None) -> dict[str, Any]`

so each method uses the same `(user_id, agent_id)` scope.

- [ ] **Step 4: Re-run the focused backend tests to verify they pass**

Run:

```bash
cd backend && .venv/bin/python -m pytest tests/test_memory_scope.py tests/test_mem0_service.py -q
```

Expected: PASS with canonical lead/custom agent scope resolution and mem0 service support for `agent_id`.

- [ ] **Step 5: Commit**

```bash
git add backend/packages/harness/deerflow/agents/memory/scope.py backend/packages/harness/deerflow/agents/memory/mem0_service.py backend/tests/test_memory_scope.py backend/tests/test_mem0_service.py
git commit -m "feat: add mem0 memory scope resolver"
```

### Task 2: Scope runtime memory writes and retrieval by `agent_id`

**Files:**
- Modify: `backend/packages/harness/deerflow/agents/memory/updater.py`
- Modify: `backend/packages/harness/deerflow/agents/memory/memory_retrieval.py`
- Modify: `backend/packages/harness/deerflow/agents/middlewares/mem0_injection_middleware.py`
- Modify: `backend/tests/test_memory_updater.py`
- Modify: `backend/tests/test_mem0_retrieval.py`
- Modify: `backend/tests/test_mem0_injection_middleware.py`
- Test: `backend/tests/test_memory_updater.py`
- Test: `backend/tests/test_mem0_retrieval.py`
- Test: `backend/tests/test_mem0_injection_middleware.py`

- [ ] **Step 1: Write the failing runtime scoping tests**

Add these tests to `backend/tests/test_memory_updater.py`:

```python
def test_memory_updater_uses_lead_scope_when_agent_name_missing(monkeypatch) -> None:
    service = SimpleNamespace(add_conversation=Mock(return_value={"ok": True}))
    monkeypatch.setattr("deerflow.agents.memory.updater.get_memory_config", lambda: _memory_config(enabled=True, provider="mem0"))
    monkeypatch.setattr("deerflow.agents.memory.updater.get_mem0_service", lambda: service)

    result = asyncio.run(
        MemoryUpdater().aupdate_memory(
            messages=[
                {"role": "user", "content": "remember this"},
                {"role": "assistant", "content": "ok"},
            ],
            thread_id="thread-1",
            user_id="user-1",
            agent_name=None,
        )
    )

    assert result is True
    assert service.add_conversation.call_args.kwargs["agent_id"] == "__lead__"
```

```python
def test_memory_updater_uses_custom_agent_scope(monkeypatch) -> None:
    service = SimpleNamespace(add_conversation=Mock(return_value={"ok": True}))
    monkeypatch.setattr("deerflow.agents.memory.updater.get_memory_config", lambda: _memory_config(enabled=True, provider="mem0"))
    monkeypatch.setattr("deerflow.agents.memory.updater.get_mem0_service", lambda: service)

    asyncio.run(
        MemoryUpdater().aupdate_memory(
            messages=[
                {"role": "user", "content": "remember this"},
                {"role": "assistant", "content": "ok"},
            ],
            thread_id="thread-1",
            user_id="user-1",
            agent_name="code-test",
        )
    )

    assert service.add_conversation.call_args.kwargs["agent_id"] == "code-test"
```

Add this to `backend/tests/test_mem0_retrieval.py`:

```python
def test_build_mem0_injection_memory_queries_custom_agent_scope(monkeypatch) -> None:
    service = SimpleNamespace(get_all=Mock(return_value=[]), search=Mock(return_value=[]))
    monkeypatch.setattr("deerflow.agents.memory.memory_retrieval.get_mem0_service", lambda: service)
    monkeypatch.setattr("deerflow.agents.memory.memory_retrieval.get_memory_config", lambda: SimpleNamespace(max_injection_tokens=2000, profile_budget_ratio=0.3, profile_limit=4, profile_categories=["preference", "context", "knowledge"], query_window_turns=3, search_limit=8))

    build_mem0_injection_memory(
        user_id="user-1",
        agent_name="code-test",
        messages=[HumanMessage(content="Need Tianjin suppliers")],
        thread_id="thread-1",
    )

    assert service.get_all.call_args.kwargs == {"user_id": "user-1", "agent_id": "code-test"}
    assert service.search.call_args.kwargs["agent_id"] == "code-test"
```

Add this to `backend/tests/test_mem0_injection_middleware.py`:

```python
def test_mem0_injection_middleware_forwards_agent_name_to_builder(monkeypatch) -> None:
    middleware = Mem0InjectionMiddleware()
    request = MagicMock()
    request.messages = [HumanMessage(content="hello")]
    handler = MagicMock(return_value="response")
    captured = {}

    monkeypatch.setattr("deerflow.agents.middlewares.mem0_injection_middleware.get_memory_config", lambda: SimpleNamespace(enabled=True, injection_enabled=True, provider="mem0", max_injection_tokens=2000))
    monkeypatch.setattr("deerflow.agents.middlewares.mem0_injection_middleware.get_config", lambda: {"configurable": {"user_id": "user-123", "thread_id": "thread-1", "agent_name": "code-test"}})
    monkeypatch.setattr(
        "deerflow.agents.middlewares.mem0_injection_middleware.build_mem0_injection_memory",
        lambda **kwargs: captured.update(kwargs) or None,
    )

    middleware.wrap_model_call(request, handler)

    assert captured["agent_name"] == "code-test"
```

- [ ] **Step 2: Run the focused runtime tests to verify they fail**

Run:

```bash
cd backend && .venv/bin/python -m pytest tests/test_memory_updater.py tests/test_mem0_retrieval.py tests/test_mem0_injection_middleware.py -q
```

Expected: FAIL because runtime writes and retrieval still ignore `agent_name`.

- [ ] **Step 3: Implement runtime lead/custom memory scoping**

Update `backend/packages/harness/deerflow/agents/memory/updater.py`:

```python
from deerflow.agents.memory.scope import resolve_memory_agent_id
```

Inside `MemoryUpdater.aupdate_memory(...)` mem0 branch:

```python
agent_id = resolve_memory_agent_id(agent_name=agent_name)
result = get_mem0_service().add_conversation(
    messages=mem0_messages,
    user_id=user_id,
    agent_id=agent_id,
    run_id=thread_id,
    metadata={
        "thread_id": thread_id or "",
        "source": thread_id or "unknown",
        "agent_id": agent_id,
    },
)
```

Update `backend/packages/harness/deerflow/agents/memory/memory_retrieval.py`:

```python
from deerflow.agents.memory.scope import resolve_memory_agent_id
```

Change the builder signature and mem0 lookups:

```python
def build_mem0_injection_memory(*, user_id: str, agent_name: str | None, messages: list[Any], thread_id: str | None = None, trace_parent: Any | None = None) -> dict[str, Any] | None:
    agent_id = resolve_memory_agent_id(agent_name=agent_name)
    profile_results = _profile_candidates(service.get_all(user_id=user_id, agent_id=agent_id))
    query_results = service.search(query=query, user_id=user_id, agent_id=agent_id, limit=config.search_limit) if query else []
```

Update `backend/packages/harness/deerflow/agents/middlewares/mem0_injection_middleware.py` so it forwards `agent_name` from `configurable`:

```python
agent_name = configurable.get("agent_name")
compat_memory = build_mem0_injection_memory(
    user_id=user_id,
    agent_name=agent_name,
    messages=request.messages,
    thread_id=thread_id,
    trace_parent=span,
)
```

- [ ] **Step 4: Re-run the focused runtime tests to verify they pass**

Run:

```bash
cd backend && .venv/bin/python -m pytest tests/test_memory_updater.py tests/test_mem0_retrieval.py tests/test_mem0_injection_middleware.py -q
```

Expected: PASS with `__lead__` for main chat and normalized custom agent scopes for agent chat.

- [ ] **Step 5: Commit**

```bash
git add backend/packages/harness/deerflow/agents/memory/updater.py backend/packages/harness/deerflow/agents/memory/memory_retrieval.py backend/packages/harness/deerflow/agents/middlewares/mem0_injection_middleware.py backend/tests/test_memory_updater.py backend/tests/test_mem0_retrieval.py backend/tests/test_mem0_injection_middleware.py
git commit -m "feat: isolate runtime memory by agent scope"
```

### Task 3: Add lead/default agent scope to Gateway `/api/memory` compatibility routes

**Files:**
- Modify: `backend/app/gateway/routers/memory.py`
- Modify: `backend/packages/harness/deerflow/agents/memory/updater.py`
- Modify: `backend/tests/test_memory_router.py`
- Modify: `backend/tests/test_memory_updater.py`
- Test: `backend/tests/test_memory_router.py`
- Test: `backend/tests/test_memory_updater.py`

- [ ] **Step 1: Write the failing Gateway memory route tests**

Add these tests to `backend/tests/test_memory_router.py`:

```python
def test_mem0_read_routes_default_to_lead_agent_id_when_header_missing() -> None:
    app = FastAPI()
    app.include_router(memory.router)

    with (
        patch("app.gateway.routers.memory.get_memory_config", return_value=_memory_config(provider="mem0")),
        patch("app.gateway.routers.memory.get_memory_data", return_value=_sample_memory()) as get_memory,
    ):
        with TestClient(app) as client:
            response = client.get("/api/memory", headers={"X-User-Id": "user-123"})

    assert response.status_code == 200
    get_memory.assert_called_once_with(user_id="user-123", agent_id="__lead__")
```

```python
def test_mem0_read_routes_forward_agent_id_header() -> None:
    app = FastAPI()
    app.include_router(memory.router)

    with (
        patch("app.gateway.routers.memory.get_memory_config", return_value=_memory_config(provider="mem0")),
        patch("app.gateway.routers.memory.get_memory_data", return_value=_sample_memory()) as get_memory,
    ):
        with TestClient(app) as client:
            response = client.get(
                "/api/memory",
                headers={"X-User-Id": "user-123", "X-Agent-Id": "code-test"},
            )

    assert response.status_code == 200
    get_memory.assert_called_once_with(user_id="user-123", agent_id="code-test")
```

Add this to `backend/tests/test_memory_updater.py`:

```python
def test_get_memory_data_uses_mem0_service_with_agent_id(monkeypatch) -> None:
    service = SimpleNamespace(build_compat_memory=Mock(return_value=_sample_memory()))
    monkeypatch.setattr("deerflow.agents.memory.updater.get_memory_config", lambda: _memory_config(provider="mem0"))
    monkeypatch.setattr("deerflow.agents.memory.updater.get_mem0_service", lambda: service)

    result = get_memory_data(user_id="user-1", agent_id="__lead__")

    assert result["version"] == "1.0"
    assert service.build_compat_memory.call_args.kwargs == {"user_id": "user-1", "agent_id": "__lead__"}
```

- [ ] **Step 2: Run the Gateway memory tests to verify they fail**

Run:

```bash
cd backend && .venv/bin/python -m pytest tests/test_memory_router.py tests/test_memory_updater.py -q
```

Expected: FAIL because `/api/memory` only forwards `user_id` today.

- [ ] **Step 3: Implement `X-Agent-Id` support and lead defaults**

Update `backend/packages/harness/deerflow/agents/memory/updater.py` public helpers so mem0 compatibility operations accept `agent_id`:

```python
def get_memory_data(agent_name: str | None = None, user_id: str | None = None, agent_id: str | None = None) -> dict[str, Any]:
    if get_memory_config().provider == "mem0":
        if not user_id:
            return create_empty_memory()
        resolved_agent_id = resolve_memory_agent_id(agent_name=agent_name, agent_id=agent_id)
        return get_mem0_service().build_compat_memory(user_id=user_id, agent_id=resolved_agent_id)
```

Apply the same `agent_id` parameter and resolution pattern to:

- `reload_memory_data(...)`
- `import_memory_data(...)`
- `clear_memory_data(...)`
- `create_memory_fact(...)`
- `delete_memory_fact(...)`
- `update_memory_fact(...)`

Update `backend/app/gateway/routers/memory.py`:

```python
_MEM0_AGENT_ID_HEADER = "X-Agent-Id"
```

```python
def _resolve_memory_agent_id_header(request: Request) -> str:
    raw = request.headers.get(_MEM0_AGENT_ID_HEADER)
    return resolve_memory_agent_id(agent_id=raw)
```

```python
def _with_optional_memory_scope(user_id: str | None, agent_id: str | None, **kwargs: object) -> dict[str, object]:
    if user_id is not None:
        kwargs["user_id"] = user_id
    if agent_id is not None:
        kwargs["agent_id"] = agent_id
    return kwargs
```

For each mem0 route, replace `_with_optional_user_id(user_id)` with:

```python
agent_id = _resolve_memory_agent_id_header(request)
memory_data = get_memory_data(**_with_optional_memory_scope(user_id, agent_id))
```

Use the same pattern for reload, status, import, create fact, update fact, delete fact, clear, and export.

- [ ] **Step 4: Re-run the Gateway memory tests to verify they pass**

Run:

```bash
cd backend && .venv/bin/python -m pytest tests/test_memory_router.py tests/test_memory_updater.py -q
```

Expected: PASS with `X-Agent-Id` support and `__lead__` fallback.

- [ ] **Step 5: Commit**

```bash
git add backend/app/gateway/routers/memory.py backend/packages/harness/deerflow/agents/memory/updater.py backend/tests/test_memory_router.py backend/tests/test_memory_updater.py
git commit -m "feat: scope gateway memory routes by agent"
```

### Task 4: Keep BFF `/memory` lead-only and update visible Memory copy

**Files:**
- Create: `bff/app/core/memory_scope.py`
- Modify: `bff/app/clients/deerflow.py`
- Modify: `bff/app/api/routes/memory.py`
- Modify: `bff/tests/clients/test_deerflow_client.py`
- Modify: `bff/tests/api/test_memory_routes.py`
- Modify: `frontend/src/core/i18n/locales/en-US.ts`
- Modify: `frontend/src/core/i18n/locales/zh-CN.ts`
- Test: `bff/tests/clients/test_deerflow_client.py`
- Test: `bff/tests/api/test_memory_routes.py`

- [ ] **Step 1: Write the failing BFF lead-scope tests**

Add these tests to `bff/tests/clients/test_deerflow_client.py`:

```python
def test_get_memory_forwards_user_and_agent_headers(monkeypatch) -> None:
    async def mock_get(self, url: str, *args, **kwargs):
        request = httpx.Request("GET", url)
        assert url.endswith("/api/memory")
        assert kwargs["headers"] == {
            "X-User-Id": "u-1",
            "X-Agent-Id": "__lead__",
        }
        return httpx.Response(200, json={"version": "1.0", "facts": []}, request=request)

    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

    result = asyncio.run(DeerFlowClient().get_memory(user_id="u-1", agent_id="__lead__"))

    assert result["version"] == "1.0"
```

Add this test to `bff/tests/api/test_memory_routes.py`:

```python
def test_memory_reads_lead_agent_scope(client, monkeypatch) -> None:
    calls: list[tuple[str, str]] = []

    async def fake_get_memory(self, *, user_id: str, agent_id: str) -> dict:
        calls.append((user_id, agent_id))
        return {
            "version": "1.0",
            "lastUpdated": "2026-04-21T12:00:00Z",
            "user": {
                "workContext": {"summary": "lead", "updatedAt": "2026-04-21T12:00:00Z"},
                "personalContext": {"summary": "", "updatedAt": ""},
                "topOfMind": {"summary": "", "updatedAt": ""},
            },
            "history": {
                "recentMonths": {"summary": "", "updatedAt": ""},
                "earlierContext": {"summary": "", "updatedAt": ""},
                "longTermBackground": {"summary": "", "updatedAt": ""},
            },
            "facts": [],
        }

    monkeypatch.setattr(DeerFlowClient, "get_memory", fake_get_memory)

    token = create_access_token("user-123")
    response = client.get("/memory", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert calls == [("user-123", "__lead__")]
```

- [ ] **Step 2: Run the focused BFF tests to verify they fail**

Run:

```bash
cd bff && .venv/bin/python -m pytest tests/clients/test_deerflow_client.py tests/api/test_memory_routes.py -q
```

Expected: FAIL because BFF memory still only forwards `user_id`.

- [ ] **Step 3: Implement the lead-scope BFF memory boundary and copy updates**

Create `bff/app/core/memory_scope.py`:

```python
LEAD_MEMORY_AGENT_ID = "__lead__"
```

Update `bff/app/clients/deerflow.py`:

```python
def _memory_headers(self, user_id: str, agent_id: str | None = None) -> dict[str, str]:
    headers = {"X-User-Id": user_id}
    if agent_id is not None:
        headers["X-Agent-Id"] = agent_id
    return headers
```

```python
async def get_memory(self, *, user_id: str, agent_id: str | None = None) -> dict:
    async with httpx.AsyncClient(timeout=self.timeout) as client:
        response = await client.get(
            f"{self.base_url}/api/memory",
            headers=self._memory_headers(user_id, agent_id),
        )
        response.raise_for_status()
        return response.json()
```

Update `bff/app/api/routes/memory.py`:

```python
from app.core.memory_scope import LEAD_MEMORY_AGENT_ID

@router.get("/memory")
async def get_memory(user_id: str = Depends(get_current_user_id)) -> dict:
    return await DeerFlowClient().get_memory(
        user_id=user_id,
        agent_id=LEAD_MEMORY_AGENT_ID,
    )
```

Update locale copy in `frontend/src/core/i18n/locales/en-US.ts`:

```typescript
memory: {
  description:
    "DeerFlow keeps a separate memory space for the main agent and each custom agent. This page shows the main agent memory only.",
  summaryReadOnly:
    "Summary sections are read-only and reflect the main agent memory only. Custom agent memories are stored separately.",
}
```

Update the corresponding `frontend/src/core/i18n/locales/zh-CN.ts` copy:

```typescript
memory: {
  description:
    "DeerFlow 会为主 Agent 和每个自定义 Agent 分别维护独立记忆空间。此页面当前只展示主 Agent 的记忆。",
  summaryReadOnly:
    "摘要分区当前为只读，且只反映主 Agent 的记忆。自定义 Agent 的记忆会单独存储。",
}
```

- [ ] **Step 4: Re-run the focused BFF tests to verify they pass**

Run:

```bash
cd bff && .venv/bin/python -m pytest tests/clients/test_deerflow_client.py tests/api/test_memory_routes.py -q
```

Expected: PASS with lead-only BFF memory reads.

- [ ] **Step 5: Commit**

```bash
git add bff/app/core/memory_scope.py bff/app/clients/deerflow.py bff/app/api/routes/memory.py bff/tests/clients/test_deerflow_client.py bff/tests/api/test_memory_routes.py frontend/src/core/i18n/locales/en-US.ts frontend/src/core/i18n/locales/zh-CN.ts
git commit -m "feat: scope bff memory to lead agent"
```

### Task 5: Update docs and run focused verification

**Files:**
- Modify: `backend/docs/API.md`
- Modify: `bff/README.md`
- Modify: `frontend/README.md`
- Test: `backend/tests/test_memory_scope.py`
- Test: `backend/tests/test_mem0_service.py`
- Test: `backend/tests/test_memory_updater.py`
- Test: `backend/tests/test_mem0_retrieval.py`
- Test: `backend/tests/test_mem0_injection_middleware.py`
- Test: `backend/tests/test_memory_router.py`
- Test: `bff/tests/clients/test_deerflow_client.py`
- Test: `bff/tests/api/test_memory_routes.py`
- Test: `frontend/src/app/api/bff/memory/route.boundary.test.ts`
- Test: `frontend/src/components/workspace/settings/memory-settings-page.boundary.test.ts`
- Test: `frontend/src/core/settings-api-boundary.test.ts`

- [ ] **Step 1: Update docs for lead/custom memory scope semantics**

Add this section to `backend/docs/API.md` near the memory route notes:

```md
### Memory scope in mem0 mode

When `memory.provider=mem0`, compatibility memory routes are scoped by both:

- `X-User-Id` — required authenticated user scope
- `X-Agent-Id` — optional agent scope header; defaults to `__lead__`

This means main chat reads and writes lead-agent memory, while each custom agent
uses its own isolated memory scope.
```

Add this section to `bff/README.md` near the Memory route description:

```md
## Lead Memory Scope

The public BFF `GET /memory` route always reads the lead-agent memory scope.
It forwards both `X-User-Id` and `X-Agent-Id: __lead__` to Gateway so
`Settings > Memory` remains a stable main-chat memory view.
```

Update `frontend/README.md` runtime-boundary wording to include:

```md
- `Settings > Memory` now reads only the lead-agent memory scope
- custom-agent memories are stored separately and are not shown in Settings in this phase
```

- [ ] **Step 2: Run the focused backend verification suite**

Run:

```bash
cd backend && .venv/bin/python -m pytest tests/test_memory_scope.py tests/test_mem0_service.py tests/test_memory_updater.py tests/test_mem0_retrieval.py tests/test_mem0_injection_middleware.py tests/test_memory_router.py -q
```

Expected: PASS.

- [ ] **Step 3: Run the focused BFF verification suite**

Run:

```bash
cd bff && .venv/bin/python -m pytest tests/clients/test_deerflow_client.py tests/api/test_memory_routes.py -q
```

Expected: PASS.

- [ ] **Step 4: Run the focused frontend verification suite**

Run:

```bash
cd frontend && node --test src/app/api/bff/memory/route.boundary.test.ts src/components/workspace/settings/memory-settings-page.boundary.test.ts src/core/settings-api-boundary.test.ts
```

Expected: PASS.

Run:

```bash
cd frontend && pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/docs/API.md bff/README.md frontend/README.md
git commit -m "docs: describe isolated agent memory scopes"
```

## Self-Review

### Spec coverage

- Canonical `__lead__` + custom `agent_name` mapping is covered in Tasks 1 and 2.
- Runtime write isolation is covered in Task 2.
- Runtime retrieval isolation is covered in Task 2.
- Gateway `/api/memory` lead/default scope behavior is covered in Task 3.
- BFF `/memory` lead-only behavior is covered in Task 4.
- `Settings > Memory` lead-only copy and product semantics are covered in Task 4.
- Docs and verification are covered in Task 5.

### Placeholder scan

Run after saving the plan:

```bash
rg -n "T[B]D|T[O]DO|implement[[:space:]]later|fill[[:space:]]in[[:space:]]details|appropriate[[:space:]]error[[:space:]]handling|write[[:space:]]tests[[:space:]]for[[:space:]]the[[:space:]]above|similar[[:space:]]to" docs/superpowers/plans/2026-04-22-agent-memory-scope-isolation.md
```
