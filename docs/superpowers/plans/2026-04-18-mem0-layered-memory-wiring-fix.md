# Mem0 Layered Memory Wiring Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore production-ready `mem0` memory wiring by updating the adapter to the current Mem0 SDK contract and aligning extraction guidance with the current supported configuration surface.

**Architecture:** Keep the existing DeerFlow memory flow intact: `MemoryMiddleware` writes post-run conversations, `Mem0InjectionMiddleware` retrieves user-scoped memories at request time, and `Mem0Service` remains the only SDK adapter. Fix the adapter at the boundary instead of changing higher-level retrieval policy or middleware orchestration.

**Tech Stack:** Python 3.12, pytest, DeerFlow harness, Mem0 OSS SDK

---

### Task 1: Lock the expected adapter behavior with tests

**Files:**
- Modify: `backend/tests/test_mem0_service.py`

- [ ] **Step 1: Write the failing test**

Add tests that assert:
- `Mem0Service.search()` passes `top_k` and `filters={"user_id": ...}`
- `Mem0Service.get_all()` passes `filters={"user_id": ...}` and a bounded `top_k`
- `_ensure_client()` maps DeerFlow memory guidance into Mem0's supported `custom_instructions` field

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest backend/tests/test_mem0_service.py -q`
Expected: FAIL because the adapter still uses legacy `limit=` / `get_all(user_id=...)` calls and injects obsolete prompt config keys.

- [ ] **Step 3: Write minimal implementation**

Update `Mem0Service` to:
- translate DeerFlow search/get-all calls to the current Mem0 SDK argument names
- generate a concise `custom_instructions` string that preserves DeerFlow's user-only, durable-memory extraction rules

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest backend/tests/test_mem0_service.py -q`
Expected: PASS

### Task 2: Verify the retrieval path still works through the service adapter

**Files:**
- Modify: `backend/tests/test_mem0_retrieval.py` (only if adapter contract changes require it)
- Test: `backend/tests/test_mem0_service.py`
- Test: `backend/tests/test_mem0_retrieval.py`

- [ ] **Step 1: Run targeted retrieval tests**

Run: `uv run pytest backend/tests/test_mem0_service.py backend/tests/test_mem0_retrieval.py -q`
Expected: PASS with no adapter regressions.

- [ ] **Step 2: Inspect for unnecessary changes**

Confirm no middleware or retrieval-policy changes were needed beyond the adapter.

### Task 3: Final verification

**Files:**
- Modify: `backend/packages/harness/deerflow/agents/memory/mem0_service.py`
- Test: `backend/tests/test_mem0_service.py`
- Test: `backend/tests/test_mem0_retrieval.py`

- [ ] **Step 1: Run final targeted verification**

Run: `uv run pytest backend/tests/test_mem0_service.py backend/tests/test_mem0_retrieval.py backend/tests/test_memory_updater.py -q`
Expected: PASS

- [ ] **Step 2: Summarize the behavioral change**

Document that the fix keeps Mem0 as the user-scoped long-term memory backend, updates SDK argument mapping, and restores durable user-memory extraction guidance through the supported Mem0 config path.
