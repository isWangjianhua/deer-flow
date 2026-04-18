# Full-Content Mem0 LangSmith Tracing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record complete Mem0-related prompt, injection, payload, write-back, and extraction content in LangSmith for all environments, matching the current project's full model-trace style.

**Architecture:** Extend the existing `deerflow.tracing.memory` helper so it can carry large full-content `inputs` and `outputs`, then instrument the current prompt-render, middleware-injection, provider-payload, and Mem0 write boundaries. Keep the runtime memory behavior unchanged; only observability changes.

**Tech Stack:** Python 3.12, LangSmith SDK, LangChain/LangGraph, pytest

---

## File Structure

- Modify: `backend/packages/harness/deerflow/tracing/memory.py`
  - Extend the helper to support full-content inputs/outputs consistently.
- Modify: `backend/packages/harness/deerflow/agents/lead_agent/prompt.py`
  - Emit a `lead_agent.prompt.render` span containing the full rendered system prompt.
- Modify: `backend/packages/harness/deerflow/agents/middlewares/mem0_injection_middleware.py`
  - Emit full injected `<memory>` content and pre/post system-message state.
- Modify: `backend/packages/harness/deerflow/agents/memory/memory_retrieval.py`
  - Emit full selected profile/query/merged memory content.
- Modify: `backend/packages/harness/deerflow/models/patched_deepseek.py`
  - Emit a `model.payload.final` span with the final payload sent to the provider.
- Modify: `backend/packages/harness/deerflow/agents/middlewares/memory_middleware.py`
  - Emit full filtered write-back conversation content.
- Modify: `backend/packages/harness/deerflow/agents/memory/updater.py`
  - Emit the full write-back submission at the updater boundary.
- Modify: `backend/packages/harness/deerflow/agents/memory/mem0_service.py`
  - Emit full Mem0 SDK-boundary payload and returned result.
- Modify: `backend/tests/test_memory_tracing.py`
  - Add helper-level full-content tests.
- Modify: `backend/tests/test_mem0_injection_middleware.py`
  - Assert full memory message content is emitted.
- Modify: `backend/tests/test_mem0_retrieval.py`
  - Assert retrieval outputs include complete selected memory content.
- Modify: `backend/tests/test_memory_middleware.py`
  - Assert write-back queue spans include the full filtered conversation.
- Modify: `backend/tests/test_memory_updater.py`
  - Assert full write inputs/outputs are emitted.
- Modify: `backend/tests/test_mem0_service.py`
  - Assert full Mem0 payload/return data are emitted.
- Create or modify provider tests as needed: `backend/tests/test_patched_deepseek.py`
  - Assert final payload tracing exists and includes full messages.

---

### Task 1: Extend the tracing helper for full-content payloads

**Files:**
- Modify: `backend/packages/harness/deerflow/tracing/memory.py`
- Modify: `backend/tests/test_memory_tracing.py`

- [ ] **Step 1: Write the failing test**

Add these tests to `backend/tests/test_memory_tracing.py`:

```python
def test_memory_trace_forwards_full_inputs_and_outputs(monkeypatch):
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
        "lead_agent.prompt.render",
        thread_id="thread-1",
        user_id="user-1",
        inputs={"full_system_prompt": "<role>prompt</role>"},
    ):
        pass

    assert calls[0]["inputs"] == {"full_system_prompt": "<role>prompt</role>"}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `UV_CACHE_DIR=.tmp/uv-cache uv run pytest tests/test_memory_tracing.py -q`
Expected: FAIL if helper does not preserve the exact full-content inputs/outputs contract needed by later tasks.

- [ ] **Step 3: Write minimal implementation**

Ensure `memory_trace(...)` in `backend/packages/harness/deerflow/tracing/memory.py` forwards:

```python
return trace(
    name=name,
    run_type="chain",
    tags=tags or ["memory", "mem0"],
    metadata=merged_metadata,
    inputs=inputs,
)
```

Keep `user_scope_key`, `thread_id`, and `memory_provider` metadata unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `UV_CACHE_DIR=.tmp/uv-cache uv run pytest tests/test_memory_tracing.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/packages/harness/deerflow/tracing/memory.py backend/tests/test_memory_tracing.py
git commit -m "feat: support full-content memory tracing inputs"
```

### Task 2: Record the full rendered lead-agent prompt

**Files:**
- Modify: `backend/packages/harness/deerflow/agents/lead_agent/prompt.py`
- Modify: `backend/tests/test_lead_agent_prompt.py`

- [ ] **Step 1: Write the failing test**

Add a test to `backend/tests/test_lead_agent_prompt.py`:

```python
def test_apply_prompt_template_traces_full_rendered_prompt(monkeypatch):
    import deerflow.agents.lead_agent.prompt as prompt_module

    spans = []
    outputs = []

    class _Span:
        def __enter__(self):
            return self
        def end(self, *, outputs=None):
            outputs_list.append(outputs)
        def __exit__(self, exc_type, exc, tb):
            return False

    outputs_list = outputs

    def _memory_trace(name, **kwargs):
        spans.append((name, kwargs))
        return _Span()

    monkeypatch.setattr(prompt_module, "memory_trace", _memory_trace)
    monkeypatch.setattr(prompt_module, "get_agent_soul", lambda agent_name: "<soul>TEST</soul>")
    monkeypatch.setattr(prompt_module, "_get_memory_context", lambda agent_name: "")

    rendered = prompt_module.apply_prompt_template(agent_name="Tester", user_id="user-1")

    assert spans[0][0] == "lead_agent.prompt.render"
    assert spans[0][1]["inputs"]["agent_name"] == "Tester"
    assert outputs[0]["full_system_prompt"] == rendered
```

- [ ] **Step 2: Run test to verify it fails**

Run: `UV_CACHE_DIR=.tmp/uv-cache uv run pytest tests/test_lead_agent_prompt.py::test_apply_prompt_template_traces_full_rendered_prompt -q`
Expected: FAIL because prompt rendering is not yet traced.

- [ ] **Step 3: Write minimal implementation**

Update `backend/packages/harness/deerflow/agents/lead_agent/prompt.py` so `apply_prompt_template(...)` wraps final prompt rendering with:

```python
with memory_trace(
    "lead_agent.prompt.render",
    thread_id=None,
    user_id=user_id,
    tags=["prompt", "system", "render"],
    metadata={"memory_provider": memory_provider, "memory_context_used": bool(memory_context)},
    inputs={"agent_name": _resolve_agent_display_name(agent_name)},
) as span:
    prompt = SYSTEM_PROMPT_TEMPLATE.format(...)
    if span is not None and hasattr(span, "end"):
        span.end(outputs={"full_system_prompt": prompt, "memory_context": memory_context})
    return prompt
```

- [ ] **Step 4: Run test to verify it passes**

Run: `UV_CACHE_DIR=.tmp/uv-cache uv run pytest tests/test_lead_agent_prompt.py::test_apply_prompt_template_traces_full_rendered_prompt -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/packages/harness/deerflow/agents/lead_agent/prompt.py backend/tests/test_lead_agent_prompt.py
git commit -m "feat: trace full rendered lead-agent prompt"
```

### Task 3: Record full memory retrieval and injection content

**Files:**
- Modify: `backend/packages/harness/deerflow/agents/middlewares/mem0_injection_middleware.py`
- Modify: `backend/packages/harness/deerflow/agents/memory/memory_retrieval.py`
- Modify: `backend/tests/test_mem0_injection_middleware.py`
- Modify: `backend/tests/test_mem0_retrieval.py`

- [ ] **Step 1: Write the failing tests**

Add assertions that:
- `memory.mem0.middleware.injection` outputs include full `<memory>...</memory>` content
- `memory.mem0.profile_retrieval` outputs include the complete selected profile results
- `memory.mem0.query_retrieval` outputs include the complete selected query results
- `memory.mem0.merge` outputs include the complete merged memory items

Example additions:

```python
assert outputs[0]["full_memory_message"].startswith("<memory>")
assert outputs[0]["full_memory_message"].endswith("</memory>")
```

```python
assert span_outputs["memory.mem0.profile_retrieval"]["selected_profile_results"][0]["memory"] == "User likes concise summaries"
assert span_outputs["memory.mem0.query_retrieval"]["selected_query_results"][0]["memory"] == "User sources in Tianjin"
assert span_outputs["memory.mem0.merge"]["merged_results"][1]["memory"] == "User sources in Tianjin"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `UV_CACHE_DIR=.tmp/uv-cache uv run pytest tests/test_mem0_injection_middleware.py tests/test_mem0_retrieval.py -q`
Expected: FAIL because current spans only emit counters/booleans.

- [ ] **Step 3: Write minimal implementation**

Update `backend/packages/harness/deerflow/agents/middlewares/mem0_injection_middleware.py` to call:

```python
span.end(outputs={
    "injected": True,
    "facts_count": len(compat_memory.get("facts", [])),
    "formatted_tokens_estimate": _count_tokens(memory_content),
    "full_memory_message": f"<memory>\n{memory_content}\n</memory>",
    "full_request_messages_before_injection": [getattr(m, "content", "") for m in request.messages],
})
```

Update `backend/packages/harness/deerflow/agents/memory/memory_retrieval.py` so spans emit complete selected results:

```python
span.end(outputs={"selected_profile_results": profile_results})
span.end(outputs={"query_results": len(query_results), "query_kept": len(bounded_query_preview), "selected_query_results": bounded_query_preview})
span.end(outputs={"merged_count": len(merged), "deduped_count": deduped_count, "merged_results": merged})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `UV_CACHE_DIR=.tmp/uv-cache uv run pytest tests/test_mem0_injection_middleware.py tests/test_mem0_retrieval.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/packages/harness/deerflow/agents/middlewares/mem0_injection_middleware.py backend/packages/harness/deerflow/agents/memory/memory_retrieval.py backend/tests/test_mem0_injection_middleware.py backend/tests/test_mem0_retrieval.py
git commit -m "feat: trace full mem0 retrieval and injection content"
```

### Task 4: Record the final provider payload in `PatchedChatDeepSeek`

**Files:**
- Modify: `backend/packages/harness/deerflow/models/patched_deepseek.py`
- Modify: `backend/tests/test_patched_deepseek.py`

- [ ] **Step 1: Write the failing test**

Add a test to `backend/tests/test_patched_deepseek.py`:

```python
def test_get_request_payload_traces_full_final_payload(monkeypatch):
    model = _make_model()
    spans = []
    outputs = []

    class _Span:
        def __enter__(self):
            return self
        def end(self, *, outputs=None):
            outputs_list.append(outputs)
        def __exit__(self, exc_type, exc, tb):
            return False

    outputs_list = outputs

    monkeypatch.setattr("deerflow.models.patched_deepseek.memory_trace", lambda name, **kwargs: _Span())

    human = HumanMessage(content="hello")
    base_payload = {"messages": [{"role": "system", "content": "SYS"}, {"role": "user", "content": "hello"}]}

    with patch.object(type(model).__bases__[0], "_get_request_payload", return_value=base_payload):
        with patch.object(model, "_convert_input") as mock_convert:
            mock_convert.return_value = MagicMock(to_messages=lambda: [human])
            model._get_request_payload([human])

    assert outputs[0]["full_payload"]["messages"][0]["content"] == "SYS"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `UV_CACHE_DIR=.tmp/uv-cache uv run pytest tests/test_patched_deepseek.py::test_get_request_payload_traces_full_final_payload -q`
Expected: FAIL because provider payload tracing does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Update `backend/packages/harness/deerflow/models/patched_deepseek.py` to import `memory_trace` and wrap the payload return path:

```python
from deerflow.tracing import memory_trace

...
with memory_trace(
    "model.payload.final",
    thread_id=None,
    user_id=None,
    tags=["payload", "model", "deepseek"],
    inputs={"original_messages": [m.content for m in original_messages]},
) as span:
    ... existing reasoning restoration ...
    if span is not None and hasattr(span, "end"):
        span.end(outputs={"full_payload": payload})
    return payload
```

- [ ] **Step 4: Run test to verify it passes**

Run: `UV_CACHE_DIR=.tmp/uv-cache uv run pytest tests/test_patched_deepseek.py::test_get_request_payload_traces_full_final_payload -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/packages/harness/deerflow/models/patched_deepseek.py backend/tests/test_patched_deepseek.py
git commit -m "feat: trace full final deepseek payload"
```

### Task 5: Record full write-back input and extracted result

**Files:**
- Modify: `backend/packages/harness/deerflow/agents/middlewares/memory_middleware.py`
- Modify: `backend/packages/harness/deerflow/agents/memory/updater.py`
- Modify: `backend/packages/harness/deerflow/agents/memory/mem0_service.py`
- Modify: `backend/tests/test_memory_middleware.py`
- Modify: `backend/tests/test_memory_updater.py`
- Modify: `backend/tests/test_mem0_service.py`

- [ ] **Step 1: Write the failing tests**

Add assertions that:
- `memory.mem0.middleware.after_agent` outputs include the full filtered conversation content
- `memory.mem0.write` outputs include the full write submission messages
- `memory.mem0.add_conversation` outputs include the full Mem0 SDK return value

Example assertions:

```python
assert outputs[0]["filtered_messages"][0] == "hello"
```

```python
assert outputs[0]["submitted_messages"] == ["conversation"]
```

```python
assert outputs[0]["mem0_result"] == {"ok": True}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `UV_CACHE_DIR=.tmp/uv-cache uv run pytest tests/test_memory_middleware.py tests/test_memory_updater.py tests/test_mem0_service.py -q`
Expected: FAIL because current outputs only contain summary fields.

- [ ] **Step 3: Write minimal implementation**

Update `backend/packages/harness/deerflow/agents/middlewares/memory_middleware.py`:

```python
span.end(outputs={
    "queued": True,
    "correction_detected": correction_detected,
    "reinforcement_detected": reinforcement_detected,
    "filtered_messages": [getattr(m, "content", "") for m in filtered_messages],
})
```

Update `backend/packages/harness/deerflow/agents/memory/updater.py`:

```python
span.end(outputs={
    "accepted": result is not None,
    "message_count": len(messages),
    "submitted_messages": messages,
})
```

Update `backend/packages/harness/deerflow/agents/memory/mem0_service.py`:

```python
span.end(outputs={
    "payload_count": len(payload),
    "accepted": result is not None,
    "mem0_result": result,
})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `UV_CACHE_DIR=.tmp/uv-cache uv run pytest tests/test_memory_middleware.py tests/test_memory_updater.py tests/test_mem0_service.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/packages/harness/deerflow/agents/middlewares/memory_middleware.py backend/packages/harness/deerflow/agents/memory/updater.py backend/packages/harness/deerflow/agents/memory/mem0_service.py backend/tests/test_memory_middleware.py backend/tests/test_memory_updater.py backend/tests/test_mem0_service.py
git commit -m "feat: trace full mem0 writeback content"
```

### Task 6: Full verification and LangSmith smoke check

**Files:**
- Modify: all files above
- Test: `backend/tests/test_memory_tracing.py`
- Test: `backend/tests/test_lead_agent_prompt.py`
- Test: `backend/tests/test_mem0_injection_middleware.py`
- Test: `backend/tests/test_mem0_retrieval.py`
- Test: `backend/tests/test_memory_middleware.py`
- Test: `backend/tests/test_memory_updater.py`
- Test: `backend/tests/test_mem0_service.py`
- Test: `backend/tests/test_patched_deepseek.py`

- [ ] **Step 1: Run the focused automated suite**

Run: `UV_CACHE_DIR=.tmp/uv-cache uv run pytest tests/test_memory_tracing.py tests/test_lead_agent_prompt.py tests/test_mem0_injection_middleware.py tests/test_mem0_retrieval.py tests/test_memory_middleware.py tests/test_memory_updater.py tests/test_mem0_service.py tests/test_patched_deepseek.py -q`
Expected: PASS

- [ ] **Step 2: Run one real LangSmith-enabled smoke flow**

Use the real `.env` LangSmith settings and trigger one authenticated chat flow, then verify in LangSmith that the following spans contain complete content:

- `lead_agent.prompt.render`
- `memory.mem0.middleware.injection`
- `memory.mem0.profile_retrieval`
- `memory.mem0.query_retrieval`
- `memory.mem0.merge`
- `model.payload.final`
- `memory.mem0.middleware.after_agent`
- `memory.mem0.write`
- `memory.mem0.add_conversation`

- [ ] **Step 3: Verify full-content policy explicitly**

Manually inspect the LangSmith run and confirm that it contains:

- the full rendered system prompt
- the full `<memory>...</memory>` block
- the full provider payload messages
- the full memory write-back submission
- the full Mem0 result / extracted content

- [ ] **Step 4: Commit**

```bash
git add backend/packages/harness/deerflow/tracing/memory.py backend/packages/harness/deerflow/agents/lead_agent/prompt.py backend/packages/harness/deerflow/agents/middlewares/mem0_injection_middleware.py backend/packages/harness/deerflow/agents/memory/memory_retrieval.py backend/packages/harness/deerflow/models/patched_deepseek.py backend/packages/harness/deerflow/agents/middlewares/memory_middleware.py backend/packages/harness/deerflow/agents/memory/updater.py backend/packages/harness/deerflow/agents/memory/mem0_service.py backend/tests/test_memory_tracing.py backend/tests/test_lead_agent_prompt.py backend/tests/test_mem0_injection_middleware.py backend/tests/test_mem0_retrieval.py backend/tests/test_memory_middleware.py backend/tests/test_memory_updater.py backend/tests/test_mem0_service.py backend/tests/test_patched_deepseek.py
git commit -m "feat: add full-content mem0 langsmith tracing"
```
