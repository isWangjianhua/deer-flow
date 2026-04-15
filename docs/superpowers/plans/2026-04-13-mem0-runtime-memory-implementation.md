# Mem0 Runtime Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace DeerFlow's file-backed runtime memory with `Mem0 OSS` via the Python SDK, scope long-term memory by `user_id`, and remove the old browser-facing `/api/memory` product surface.

**Architecture:** Keep memory in `deerflow-harness`, not in BFF. BFF only passes authenticated `user_id` into runtime chat context. The harness resolves long-term memory per request through a Mem0-backed provider, injects relevant memories in `MemoryMiddleware`, and persists post-run memories back to Mem0 using the filtered conversation messages. The old Gateway memory router and frontend settings UI are removed instead of wrapped with a compatibility layer.

**Tech Stack:** FastAPI, httpx, LangGraph agent middleware, Pydantic, Mem0 OSS Python SDK, pytest, Next.js App Router, React 19, node:test

---

## File Map

### Runtime / Harness

- Modify: `backend/packages/harness/pyproject.toml`
- Modify: `backend/packages/harness/deerflow/config/memory_config.py`
- Create: `backend/packages/harness/deerflow/agents/memory/mem0_client.py`
- Modify: `backend/packages/harness/deerflow/agents/memory/storage.py`
- Modify: `backend/packages/harness/deerflow/agents/memory/__init__.py`
- Modify: `backend/packages/harness/deerflow/agents/memory/queue.py`
- Modify: `backend/packages/harness/deerflow/agents/memory/updater.py`
- Modify: `backend/packages/harness/deerflow/agents/lead_agent/prompt.py`
- Modify: `backend/packages/harness/deerflow/agents/lead_agent/agent.py`
- Modify: `backend/packages/harness/deerflow/agents/middlewares/memory_middleware.py`
- Modify: `backend/packages/harness/deerflow/client.py`

### BFF

- Modify: `bff/app/api/routes/conversations.py`
- Modify: `bff/tests/api/test_stream_routes.py`

### Gateway / Channel surface removal

- Modify: `backend/app/gateway/app.py`
- Modify: `backend/app/channels/manager.py`
- Delete: `backend/app/gateway/routers/memory.py`
- Delete: `backend/tests/test_memory_router.py`
- Create: `backend/tests/test_gateway_app_memory_surface.py`

### Frontend surface removal

- Modify: `frontend/src/components/workspace/settings/settings-dialog.tsx`
- Modify: `frontend/src/core/settings-api-boundary.test.ts`
- Modify: `frontend/src/core/i18n/locales/en-US.ts`
- Modify: `frontend/src/core/i18n/locales/zh-CN.ts`
- Modify: `frontend/src/core/i18n/locales/types.ts`
- Delete: `frontend/src/app/api/memory/route.ts`
- Delete: `frontend/src/app/api/memory/[...path]/route.ts`
- Delete: `frontend/src/components/workspace/settings/memory-settings-page.tsx`
- Delete: `frontend/src/core/memory/api.ts`
- Delete: `frontend/src/core/memory/hooks.ts`
- Delete: `frontend/src/core/memory/types.ts`
- Create: `frontend/src/components/workspace/settings/settings-dialog.boundary.test.ts`

### Tests and docs

- Create: `backend/tests/test_memory_middleware.py`
- Modify: `backend/tests/test_memory_storage.py`
- Modify: `backend/tests/test_memory_updater.py`
- Modify: `backend/tests/test_lead_agent_prompt.py`
- Modify: `backend/README.md`
- Modify: `backend/CLAUDE.md`
- Modify: `bff/README.md`
- Modify: `bff/docs/ROADMAP.md`
- Modify: `frontend/README.md`
- Modify: `frontend/AGENTS.md`
- Modify: `config.example.yaml`

### Planned decomposition

- Task 1 wires `user_id` from BFF to runtime.
- Task 2 adds the Mem0 SDK dependency, config surface, and provider wrapper.
- Task 3 converts memory injection from cached prompt-time loading to request-time middleware injection.
- Task 4 rewrites memory persistence to use Mem0 and `user_id`-scoped queue contexts.
- Task 5 removes the old Gateway/frontend memory surface.
- Task 6 updates docs and runs focused verification.

### Task 1: Pass authenticated `user_id` into runtime chat context

**Files:**
- Modify: `bff/tests/api/test_stream_routes.py`
- Modify: `bff/app/api/routes/conversations.py`
- Test: `bff/tests/api/test_stream_routes.py`

- [ ] **Step 1: Write the failing BFF stream-context test**

```python
def test_stream_route_forwards_authenticated_user_id_to_deerflow(
    client,
    db_session,
    monkeypatch,
) -> None:
    class FakeResponse:
        async def aiter_lines(self):
            for line in ["event: end", "data: {}", ""]:
                yield line

        async def aclose(self) -> None:
            return None

    class FakeClient:
        async def aclose(self) -> None:
            return None

    captured: dict[str, object] = {}

    async def mock_stream_message(self, thread_id: str, message: str, context=None):
        captured["thread_id"] = thread_id
        captured["message"] = message
        captured["context"] = context
        return FakeClient(), FakeResponse()

    async def mock_get_thread_history(self, thread_id: str, limit: int = 1) -> list[dict]:
        return []

    monkeypatch.setattr(DeerFlowClient, "stream_message", mock_stream_message)
    monkeypatch.setattr(DeerFlowClient, "get_thread_history", mock_get_thread_history)

    login = client.post("/auth/login", json={"username": "demo", "password": "demo1234"})
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    me = client.get("/me", headers=headers)
    conversation = ConversationService(db_session).create_conversation(
        user_id=me.json()["id"],
        deerflow_thread_id="thread-owned",
    )

    response = client.post(
        f"/conversations/{conversation.id}/messages/stream",
        json={"message": "remember me"},
        headers=headers,
    )

    assert response.status_code == 200
    assert captured["context"] == {"user_id": me.json()["id"]}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd bff && uv run pytest tests/api/test_stream_routes.py -q`
Expected: FAIL because the forwarded context currently omits `user_id`.

- [ ] **Step 3: Implement `user_id` forwarding in the BFF stream route**

```python
@router.post("/{conversation_id}/messages/stream")
async def stream_message(
    conversation_id: str,
    payload: StreamMessageRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db_session),
) -> StreamingResponse:
    service = ConversationService(db)
    conversation = service.require_owned_conversation(user_id, conversation_id)
    context = {
        "user_id": user_id,
        "model_name": payload.model_name,
        "thinking_enabled": payload.thinking_enabled,
        "is_plan_mode": payload.is_plan_mode,
        "subagent_enabled": payload.subagent_enabled,
        "reasoning_effort": payload.reasoning_effort,
    }
    normalized_context = {key: value for key, value in context.items() if value is not None}
    client, response = await DeerFlowClient().stream_message(
        thread_id=conversation.deerflow_thread_id,
        message=payload.message,
        context=normalized_context,
    )
```

- [ ] **Step 4: Run the test again**

Run: `cd bff && uv run pytest tests/api/test_stream_routes.py -q`
Expected: PASS with the new context assertion green and existing stream tests still green.

- [ ] **Step 5: Commit**

```bash
git add bff/tests/api/test_stream_routes.py bff/app/api/routes/conversations.py
git commit -m "feat: pass user id into runtime stream context"
```

### Task 2: Add Mem0 SDK dependency, runtime config, and provider wrapper

**Files:**
- Modify: `backend/packages/harness/pyproject.toml`
- Modify: `backend/packages/harness/deerflow/config/memory_config.py`
- Create: `backend/packages/harness/deerflow/agents/memory/mem0_client.py`
- Modify: `backend/packages/harness/deerflow/agents/memory/storage.py`
- Modify: `backend/packages/harness/deerflow/agents/memory/__init__.py`
- Modify: `backend/tests/test_memory_storage.py`
- Test: `backend/tests/test_memory_storage.py`

- [ ] **Step 1: Write the failing Mem0 provider tests**

```python
def test_get_memory_storage_returns_mem0_client_when_provider_is_mem0(monkeypatch):
    import deerflow.agents.memory.storage as storage_mod

    storage_mod._storage_instance = None
    config = MemoryConfig(provider="mem0", mem0_search_limit=6, mem0_config={})

    monkeypatch.setattr(storage_mod, "get_memory_config", lambda: config)
    monkeypatch.setattr(storage_mod, "Mem0MemoryClient", lambda cfg: ("mem0", cfg))

    try:
        assert get_memory_storage() == ("mem0", config)
    finally:
        storage_mod._storage_instance = None
```

```python
def test_mem0_memory_client_search_normalizes_results(monkeypatch):
    fake_sync = MagicMock()
    fake_sync.search.return_value = {
        "results": [
            {"id": "mem-1", "memory": "Prefers concise answers", "score": 0.92},
        ]
    }
    fake_async = MagicMock()

    monkeypatch.setattr("deerflow.agents.memory.mem0_client.Memory", MagicMock(return_value=fake_sync))
    monkeypatch.setattr("deerflow.agents.memory.mem0_client.AsyncMemory", MagicMock(return_value=fake_async))

    client = Mem0MemoryClient(MemoryConfig(provider="mem0", mem0_search_limit=8, mem0_config={}))
    results = client.search(query="What do you know about me?", user_id="user-1", limit=4)

    assert results == [{"id": "mem-1", "memory": "Prefers concise answers", "score": 0.92}]
    fake_sync.search.assert_called_once_with(
        query="What do you know about me?",
        user_id="user-1",
        limit=4,
    )
```

- [ ] **Step 2: Run the backend storage tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_memory_storage.py -q`
Expected: FAIL because `MemoryConfig.provider`, `mem0_config`, `mem0_search_limit`, and `Mem0MemoryClient` do not exist yet.

- [ ] **Step 3: Add the Mem0 dependency and provider implementation**

```toml
dependencies = [
    "httpx>=0.28.0",
    "mem0ai>=1.0.0",
    "kubernetes>=30.0.0",
]
```

```python
class MemoryConfig(BaseModel):
    enabled: bool = Field(default=True)
    provider: Literal["file", "mem0"] = Field(default="file")
    storage_path: str = Field(default="")
    storage_class: str = Field(default="deerflow.agents.memory.storage.FileMemoryStorage")
    debounce_seconds: int = Field(default=30, ge=1, le=300)
    model_name: str | None = Field(default=None)
    max_facts: int = Field(default=100, ge=10, le=500)
    fact_confidence_threshold: float = Field(default=0.7, ge=0.0, le=1.0)
    injection_enabled: bool = Field(default=True)
    max_injection_tokens: int = Field(default=2000, ge=100, le=8000)
    mem0_config: dict[str, Any] = Field(default_factory=dict)
    mem0_search_limit: int = Field(default=8, ge=1, le=20)
    write_enabled: bool = Field(default=True)
```

```python
from mem0 import AsyncMemory, Memory
from mem0.configs.base import MemoryConfig as Mem0SDKConfig


class Mem0MemoryClient:
    def __init__(self, config: MemoryConfig) -> None:
        self._config = config
        sdk_config = Mem0SDKConfig(**config.mem0_config) if config.mem0_config else None
        self._sync_client = Memory.from_config(config.mem0_config) if config.mem0_config else Memory()
        self._async_client = AsyncMemory(config=sdk_config) if sdk_config else AsyncMemory()

    def search(self, *, query: str, user_id: str, limit: int) -> list[dict[str, Any]]:
        payload = self._sync_client.search(query=query, user_id=user_id, limit=limit)
        return list(payload.get("results", []))

    async def asearch(self, *, query: str, user_id: str, limit: int) -> list[dict[str, Any]]:
        payload = await self._async_client.search(query=query, user_id=user_id, limit=limit)
        return list(payload.get("results", []))

    def add_messages(
        self,
        *,
        user_id: str,
        messages: list[dict[str, str]],
        metadata: dict[str, Any] | None = None,
    ) -> bool:
        self._sync_client.add(messages, user_id=user_id, metadata=metadata or {})
        return True
```

```python
def get_memory_storage() -> MemoryStorage | Mem0MemoryClient:
    global _storage_instance
    if _storage_instance is not None:
        return _storage_instance

    with _storage_lock:
        if _storage_instance is not None:
            return _storage_instance

        config = get_memory_config()
        if config.provider == "mem0":
            _storage_instance = Mem0MemoryClient(config)
            return _storage_instance

        _storage_instance = FileMemoryStorage()
        return _storage_instance
```

- [ ] **Step 4: Re-run the backend storage tests**

Run: `cd backend && uv run pytest tests/test_memory_storage.py -q`
Expected: PASS with both file-backed fallback tests and the new Mem0 selection tests green.

- [ ] **Step 5: Commit**

```bash
git add backend/packages/harness/pyproject.toml backend/packages/harness/deerflow/config/memory_config.py backend/packages/harness/deerflow/agents/memory/mem0_client.py backend/packages/harness/deerflow/agents/memory/storage.py backend/packages/harness/deerflow/agents/memory/__init__.py backend/tests/test_memory_storage.py
git commit -m "feat: add mem0 runtime memory provider"
```

### Task 3: Move long-term memory injection to request time

**Files:**
- Create: `backend/tests/test_memory_middleware.py`
- Modify: `backend/tests/test_lead_agent_prompt.py`
- Modify: `backend/packages/harness/deerflow/agents/middlewares/memory_middleware.py`
- Modify: `backend/packages/harness/deerflow/agents/lead_agent/prompt.py`
- Modify: `backend/packages/harness/deerflow/agents/lead_agent/agent.py`
- Modify: `backend/packages/harness/deerflow/client.py`
- Test: `backend/tests/test_memory_middleware.py`
- Test: `backend/tests/test_lead_agent_prompt.py`

- [ ] **Step 1: Write the failing middleware and prompt tests**

```python
async def test_memory_middleware_injects_mem0_results_for_user_scope(monkeypatch):
    middleware = MemoryMiddleware()
    state = {"messages": [HumanMessage(content="What should I read next?")]}
    runtime = SimpleNamespace(context={"thread_id": "thread-1", "user_id": "user-42"})

    storage = MagicMock()
    storage.asearch = AsyncMock(
        return_value=[{"id": "mem-1", "memory": "User likes hard sci-fi novels.", "score": 0.97}]
    )
    monkeypatch.setattr(memory_middleware_module, "get_memory_storage", lambda: storage)

    result = await middleware.abefore_model(state, runtime)

    assert result is not None
    assert "User likes hard sci-fi novels." in result["messages"][0].content
    storage.asearch.assert_awaited_once()
```

```python
def test_apply_prompt_template_no_longer_embeds_runtime_memory(monkeypatch):
    monkeypatch.setattr(prompt_module, "_get_enabled_skills", lambda: [])
    monkeypatch.setattr(prompt_module, "get_deferred_tools_prompt_section", lambda: "")
    monkeypatch.setattr(prompt_module, "_build_acp_section", lambda: "")
    monkeypatch.setattr(prompt_module, "get_agent_soul", lambda agent_name=None: "")

    prompt = prompt_module.apply_prompt_template()

    assert "<memory>" not in prompt
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_memory_middleware.py tests/test_lead_agent_prompt.py -q`
Expected: FAIL because `MemoryMiddleware` has no `abefore_model()` memory injection path and `apply_prompt_template()` still resolves memory during prompt generation.

- [ ] **Step 3: Implement request-time memory injection and remove prompt-time loading**

```python
def format_mem0_memories_for_injection(results: list[dict[str, Any]], max_tokens: int) -> str:
    lines: list[str] = []
    for entry in results:
        memory = entry.get("memory")
        if isinstance(memory, str) and memory.strip():
            lines.append(f"- {memory.strip()}")
    block = "\n".join(lines)
    return block if _count_tokens(block) <= max_tokens else "\n".join(lines[: max(1, len(lines) // 2)])
```

```python
class MemoryMiddleware(AgentMiddleware[MemoryMiddlewareState]):
    @override
    async def abefore_model(self, state: MemoryMiddlewareState, runtime: Runtime) -> dict | None:
        config = get_memory_config()
        if not config.enabled or not config.injection_enabled:
            return None

        user_id = runtime.context.get("user_id") if runtime.context else None
        if not user_id:
            return None

        messages = state.get("messages", [])
        query = _build_memory_query(messages)
        if not query:
            return None

        results = await get_memory_storage().asearch(
            query=query,
            user_id=user_id,
            limit=config.mem0_search_limit,
        )
        memory_block = format_mem0_memories_for_injection(results, max_tokens=config.max_injection_tokens)
        if not memory_block:
            return None

        return {
            "messages": [
                HumanMessage(
                    name="memory_context",
                    content=f"<memory>\n{memory_block}\n</memory>",
                )
            ]
        }
```

```python
def apply_prompt_template(
    subagent_enabled: bool = False,
    max_concurrent_subagents: int = 3,
    *,
    agent_name: str | None = None,
    available_skills: set[str] | None = None,
) -> str:
    prompt = SYSTEM_PROMPT_TEMPLATE.format(
        agent_name=agent_name or "DeerFlow 2.0",
        soul=get_agent_soul(agent_name),
        skills_section=skills_section,
        deferred_tools_section=deferred_tools_section,
        memory_context="",
        subagent_section=subagent_section,
        subagent_reminder=subagent_reminder,
        subagent_thinking=subagent_thinking,
        acp_section=acp_and_mounts_section,
    )
    return prompt + f"\n<current_date>{datetime.now().strftime('%Y-%m-%d, %A')}</current_date>"
```

```python
class DeerFlowClient:
    """Embedded Python client for DeerFlow agent system.

    Note:
        Long-term memory is injected at request time by MemoryMiddleware.
        The cached system prompt only contains stable instructions and skills context.
    """
```

- [ ] **Step 4: Re-run the middleware and prompt tests**

Run: `cd backend && uv run pytest tests/test_memory_middleware.py tests/test_lead_agent_prompt.py -q`
Expected: PASS with dynamic injection verified and cached prompt no longer containing durable memory.

- [ ] **Step 5: Commit**

```bash
git add backend/tests/test_memory_middleware.py backend/tests/test_lead_agent_prompt.py backend/packages/harness/deerflow/agents/middlewares/memory_middleware.py backend/packages/harness/deerflow/agents/lead_agent/prompt.py backend/packages/harness/deerflow/agents/lead_agent/agent.py backend/packages/harness/deerflow/client.py
git commit -m "feat: inject mem0 memory at request time"
```

### Task 4: Rewrite queued memory persistence to use Mem0 and `user_id`

**Files:**
- Modify: `backend/tests/test_memory_updater.py`
- Modify: `backend/tests/test_memory_middleware.py`
- Modify: `backend/packages/harness/deerflow/agents/memory/queue.py`
- Modify: `backend/packages/harness/deerflow/agents/memory/updater.py`
- Modify: `backend/packages/harness/deerflow/agents/middlewares/memory_middleware.py`
- Test: `backend/tests/test_memory_updater.py`
- Test: `backend/tests/test_memory_middleware.py`

- [ ] **Step 1: Write the failing updater and queue tests**

```python
def test_update_memory_adds_filtered_conversation_to_mem0(monkeypatch):
    storage = MagicMock()
    storage.add_messages.return_value = True
    monkeypatch.setattr(updater_module, "get_memory_storage", lambda: storage)

    messages = [
        HumanMessage(content="I prefer concise status updates."),
        AIMessage(content="Understood. I'll keep updates concise."),
    ]

    result = MemoryUpdater().update_memory(
        messages,
        user_id="user-42",
        thread_id="thread-1",
        agent_name="planner",
    )

    assert result is True
    storage.add_messages.assert_called_once_with(
        user_id="user-42",
        messages=[
            {"role": "user", "content": "I prefer concise status updates."},
            {"role": "assistant", "content": "Understood. I'll keep updates concise."},
        ],
        metadata={
            "thread_id": "thread-1",
            "agent_name": "planner",
            "correction_detected": False,
            "reinforcement_detected": False,
        },
    )
```

```python
def test_memory_middleware_after_agent_passes_user_id_to_queue(monkeypatch):
    middleware = MemoryMiddleware()
    queue = MagicMock()
    monkeypatch.setattr(memory_middleware_module, "get_memory_queue", lambda: queue)
    monkeypatch.setattr(memory_middleware_module, "get_memory_config", lambda: MemoryConfig(enabled=True))

    state = {
        "messages": [
            HumanMessage(content="Remember that I use uv."),
            AIMessage(content="Noted."),
        ]
    }
    runtime = SimpleNamespace(context={"thread_id": "thread-9", "user_id": "user-9"})

    middleware.after_agent(state, runtime)

    queue.add.assert_called_once()
    assert queue.add.call_args.kwargs["user_id"] == "user-9"
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_memory_updater.py tests/test_memory_middleware.py -q`
Expected: FAIL because `MemoryUpdater.update_memory()` does not accept `user_id`, queue contexts do not carry `user_id`, and persistence still expects structured file-backed memory.

- [ ] **Step 3: Rework the queue and updater around Mem0 message ingestion**

```python
@dataclass
class ConversationContext:
    thread_id: str
    user_id: str | None
    messages: list[Any]
    timestamp: datetime = field(default_factory=lambda: datetime.now(UTC))
    agent_name: str | None = None
    correction_detected: bool = False
    reinforcement_detected: bool = False
```

```python
def add(
    self,
    thread_id: str,
    messages: list[Any],
    user_id: str | None = None,
    agent_name: str | None = None,
    correction_detected: bool = False,
    reinforcement_detected: bool = False,
) -> None:
    config = get_memory_config()
    if not config.enabled:
        return

    with self._lock:
        existing_context = next(
            (context for context in self._queue if context.thread_id == thread_id),
            None,
        )
        merged_correction_detected = correction_detected or (
            existing_context.correction_detected if existing_context is not None else False
        )
        merged_reinforcement_detected = reinforcement_detected or (
            existing_context.reinforcement_detected if existing_context is not None else False
        )
    context = ConversationContext(
        thread_id=thread_id,
        user_id=user_id,
        messages=messages,
        agent_name=agent_name,
        correction_detected=merged_correction_detected,
        reinforcement_detected=merged_reinforcement_detected,
    )
```

```python
def _to_mem0_messages(messages: list[Any]) -> list[dict[str, str]]:
    mem0_messages: list[dict[str, str]] = []
    for msg in messages:
        msg_type = getattr(msg, "type", None)
        content = _extract_message_text(msg).strip()
        if not content:
            continue
        if msg_type == "human":
            mem0_messages.append({"role": "user", "content": content})
        elif msg_type == "ai":
            mem0_messages.append({"role": "assistant", "content": content})
    return mem0_messages


def update_memory(
    self,
    messages: list[Any],
    user_id: str | None = None,
    thread_id: str | None = None,
    agent_name: str | None = None,
    correction_detected: bool = False,
    reinforcement_detected: bool = False,
) -> bool:
    config = get_memory_config()
    if not config.enabled or not config.write_enabled or not user_id:
        return False

    mem0_messages = _to_mem0_messages(messages)
    if not mem0_messages:
        return False

    return get_memory_storage().add_messages(
        user_id=user_id,
        messages=mem0_messages,
        metadata={
            "thread_id": thread_id,
            "agent_name": agent_name,
            "correction_detected": correction_detected,
            "reinforcement_detected": reinforcement_detected,
        },
    )
```

```python
queue.add(
    thread_id=thread_id,
    user_id=user_id,
    messages=filtered_messages,
    agent_name=self._agent_name,
    correction_detected=correction_detected,
    reinforcement_detected=reinforcement_detected,
)
```

- [ ] **Step 4: Re-run the updater and queue tests**

Run: `cd backend && uv run pytest tests/test_memory_updater.py tests/test_memory_middleware.py -q`
Expected: PASS with queue propagation and Mem0 writes verified. Existing correction/reinforcement tests should still pass after being updated to assert metadata instead of file-backed summaries.

- [ ] **Step 5: Commit**

```bash
git add backend/tests/test_memory_updater.py backend/tests/test_memory_middleware.py backend/packages/harness/deerflow/agents/memory/queue.py backend/packages/harness/deerflow/agents/memory/updater.py backend/packages/harness/deerflow/agents/middlewares/memory_middleware.py
git commit -m "feat: persist runtime memory to mem0 by user"
```

### Task 5: Remove the old Gateway and frontend memory product surface

**Files:**
- Create: `backend/tests/test_gateway_app_memory_surface.py`
- Modify: `backend/app/gateway/app.py`
- Modify: `backend/app/channels/manager.py`
- Delete: `backend/app/gateway/routers/memory.py`
- Delete: `backend/tests/test_memory_router.py`
- Create: `frontend/src/components/workspace/settings/settings-dialog.boundary.test.ts`
- Modify: `frontend/src/components/workspace/settings/settings-dialog.tsx`
- Modify: `frontend/src/core/settings-api-boundary.test.ts`
- Modify: `frontend/src/core/i18n/locales/en-US.ts`
- Modify: `frontend/src/core/i18n/locales/zh-CN.ts`
- Modify: `frontend/src/core/i18n/locales/types.ts`
- Delete: `frontend/src/app/api/memory/route.ts`
- Delete: `frontend/src/app/api/memory/[...path]/route.ts`
- Delete: `frontend/src/components/workspace/settings/memory-settings-page.tsx`
- Delete: `frontend/src/core/memory/api.ts`
- Delete: `frontend/src/core/memory/hooks.ts`
- Delete: `frontend/src/core/memory/types.ts`
- Test: `backend/tests/test_gateway_app_memory_surface.py`
- Test: `frontend/src/components/workspace/settings/settings-dialog.boundary.test.ts`
- Test: `frontend/src/core/settings-api-boundary.test.ts`

- [ ] **Step 1: Write the failing Gateway and frontend surface tests**

```python
def test_gateway_openapi_excludes_memory_routes() -> None:
    app = create_app()
    paths = app.openapi()["paths"]

    assert "/api/memory" not in paths
    assert "/api/memory/export" not in paths
```

```typescript
void test("settings dialog no longer renders a memory section", async () => {
  const source = await readFile(new URL("./settings-dialog.tsx", import.meta.url), "utf8");

  assert.ok(!source.includes("MemorySettingsPage"));
  assert.ok(!source.includes('id: "memory"'));
  assert.ok(!source.includes("t.settings.sections.memory"));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_gateway_app_memory_surface.py -q`
Expected: FAIL because the Gateway still mounts `/api/memory`.

Run: `cd frontend && node --test src/components/workspace/settings/settings-dialog.boundary.test.ts src/core/settings-api-boundary.test.ts`
Expected: FAIL because the Settings dialog still imports the Memory page and the settings boundary test still asserts `/api/memory`.

- [ ] **Step 3: Remove the mounted memory routes and browser UI**

```python
from app.gateway.routers import (
    agents,
    artifacts,
    assistants_compat,
    channels,
    mcp,
    models,
    runs,
    skills,
    suggestions,
    thread_runs,
    threads,
    uploads,
)

# MCP API is mounted at /api/mcp
app.include_router(mcp.router)

# Skills API is mounted at /api/skills
app.include_router(skills.router)
```

```python
elif command == "help":
    reply = (
        "Available commands:\n"
        "/bootstrap — Start a bootstrap session (enables agent setup)\n"
        "/new — Start a new conversation\n"
        "/status — Show current thread info\n"
        "/models — List available models\n"
        "/help — Show this help"
    )
```

```typescript
type SettingsSection =
  | "appearance"
  | "tools"
  | "skills"
  | "notification"
  | "about";

const sections = useMemo(
  () => [
    { id: "appearance", label: t.settings.sections.appearance, icon: PaletteIcon },
    { id: "notification", label: t.settings.sections.notification, icon: BellIcon },
    { id: "tools", label: t.settings.sections.tools, icon: WrenchIcon },
    { id: "skills", label: t.settings.sections.skills, icon: SparklesIcon },
    { id: "about", label: t.settings.sections.about, icon: InfoIcon },
  ],
  [
    t.settings.sections.appearance,
    t.settings.sections.tools,
    t.settings.sections.skills,
    t.settings.sections.notification,
    t.settings.sections.about,
  ],
);
```

```typescript
void test("skills API uses same-origin skills routes", async () => {
  const source = await readSource("./skills/api.ts");

  assert.ok(source.includes('fetch("/api/skills"'));
  assert.ok(!source.includes("getBackendBaseURL"));
});

void test("agents API uses same-origin agents routes", async () => {
  const source = await readSource("./agents/api.ts");

  assert.ok(source.includes('fetch("/api/agents"'));
  assert.ok(!source.includes("getBackendBaseURL"));
});
```

Delete these files in the same change:

```text
backend/app/gateway/routers/memory.py
backend/tests/test_memory_router.py
frontend/src/app/api/memory/route.ts
frontend/src/app/api/memory/[...path]/route.ts
frontend/src/components/workspace/settings/memory-settings-page.tsx
frontend/src/core/memory/api.ts
frontend/src/core/memory/hooks.ts
frontend/src/core/memory/types.ts
```

- [ ] **Step 4: Re-run the Gateway and frontend surface tests**

Run: `cd backend && uv run pytest tests/test_gateway_app_memory_surface.py -q`
Expected: PASS with `/api/memory` gone from OpenAPI.

Run: `cd frontend && node --test src/components/workspace/settings/settings-dialog.boundary.test.ts src/core/settings-api-boundary.test.ts`
Expected: PASS with the Memory section and same-origin memory route checks removed.

- [ ] **Step 5: Commit**

```bash
git add -A backend/app/gateway/app.py backend/app/channels/manager.py backend/tests/test_gateway_app_memory_surface.py backend/app/gateway/routers/memory.py backend/tests/test_memory_router.py frontend/src/components/workspace/settings/settings-dialog.boundary.test.ts frontend/src/components/workspace/settings/settings-dialog.tsx frontend/src/core/settings-api-boundary.test.ts frontend/src/core/i18n/locales/en-US.ts frontend/src/core/i18n/locales/zh-CN.ts frontend/src/core/i18n/locales/types.ts frontend/src/app/api/memory/route.ts frontend/src/app/api/memory/[...path]/route.ts frontend/src/components/workspace/settings/memory-settings-page.tsx frontend/src/core/memory/api.ts frontend/src/core/memory/hooks.ts frontend/src/core/memory/types.ts
git commit -m "refactor: remove legacy browser memory surface"
```

### Task 6: Update configuration examples, docs, and run focused verification

**Files:**
- Modify: `config.example.yaml`
- Modify: `backend/README.md`
- Modify: `backend/CLAUDE.md`
- Modify: `bff/README.md`
- Modify: `bff/docs/ROADMAP.md`
- Modify: `frontend/README.md`
- Modify: `frontend/AGENTS.md`

- [ ] **Step 1: Update the config example and docs**

```yaml
memory:
  enabled: true
  provider: mem0
  debounce_seconds: 30
  injection_enabled: true
  max_injection_tokens: 1200
  mem0_search_limit: 8
  write_enabled: true
  mem0_config: {}
```

```md
- runtime long-term memory now uses `Mem0 OSS` via the Python SDK
- long-term memory is scoped by authenticated `user_id`
- browser-facing `/api/memory` and Settings > Memory are removed in this slice
- BFF only forwards `user_id`; memory remains a runtime-owned concern
```

- [ ] **Step 2: Run focused backend verification**

Run: `cd backend && uv run pytest tests/test_memory_storage.py tests/test_memory_middleware.py tests/test_memory_updater.py tests/test_lead_agent_prompt.py tests/test_gateway_app_memory_surface.py -q`
Expected: PASS with Mem0 provider selection, runtime injection, persistence, and removed Gateway surface verified.

- [ ] **Step 3: Run focused BFF verification**

Run: `cd bff && uv run pytest tests/api/test_stream_routes.py -q`
Expected: PASS with `user_id` forwarded in stream context.

- [ ] **Step 4: Run focused frontend verification**

Run: `cd frontend && node --test src/components/workspace/settings/settings-dialog.boundary.test.ts src/core/settings-api-boundary.test.ts`
Expected: PASS with Memory removed from the settings dialog and same-origin memory API checks gone.

- [ ] **Step 5: Run lint / static checks on touched surfaces**

Run: `cd backend && uv run ruff check packages/harness/deerflow app tests`
Expected: PASS.

Run: `cd bff && uv run ruff check app tests`
Expected: PASS.

Run: `cd frontend && pnpm exec eslint src/components/workspace/settings/settings-dialog.tsx src/components/workspace/settings/settings-dialog.boundary.test.ts src/core/settings-api-boundary.test.ts src/core/i18n/locales/en-US.ts src/core/i18n/locales/zh-CN.ts src/core/i18n/locales/types.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add config.example.yaml backend/README.md backend/CLAUDE.md bff/README.md bff/docs/ROADMAP.md frontend/README.md frontend/AGENTS.md
git commit -m "docs: document mem0 runtime memory architecture"
```
