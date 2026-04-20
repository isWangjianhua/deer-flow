# BFF Conversation Pinning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ChatGPT-style pin/unpin actions for BFF-backed conversations so multiple pinned chats stay at the top of the recent-chat sidebar.

**Architecture:** Persist pin state in the BFF `conversations` table with `is_pinned` and `pinned_at`, expose pin/unpin through the existing BFF conversation patch route, and render pinned conversations in a dedicated top section in the sidebar. Keep `conversation_id` as the only browser-visible identifier and continue ordering unpinned chats by `updated_at`.

**Tech Stack:** FastAPI, SQLAlchemy, SQLite-compatible startup migration, Next.js same-origin routes, React Query, existing workspace sidebar UI.

---

### Task 1: Extend the BFF conversation persistence model

**Files:**
- Modify: `bff/app/models/conversation.py`
- Modify: `bff/app/main.py`
- Test: `bff/tests/services/test_conversation_service.py`

- [ ] **Step 1: Write failing tests for pin and unpin persistence**
- [ ] **Step 2: Add `is_pinned` and `pinned_at` to the SQLAlchemy model**
- [ ] **Step 3: Add startup schema backfill for existing SQLite databases**
- [ ] **Step 4: Re-run the service tests until they pass**

### Task 2: Add BFF pin/unpin behavior and ordering

**Files:**
- Modify: `bff/app/schemas/conversation.py`
- Modify: `bff/app/repositories/conversation_repo.py`
- Modify: `bff/app/services/conversation_service.py`
- Modify: `bff/app/api/routes/conversations.py`
- Test: `bff/tests/api/test_conversation_routes.py`

- [ ] **Step 1: Write failing API tests for pinning and unpinning**
- [ ] **Step 2: Extend patch payload and list item schema to include pin fields**
- [ ] **Step 3: Implement pin/unpin service methods via the existing patch route**
- [ ] **Step 4: Sort pinned chats before unpinned chats in repository list queries**
- [ ] **Step 5: Re-run the targeted BFF tests**

### Task 3: Add frontend API and sidebar pin actions

**Files:**
- Modify: `frontend/src/core/bff-chat/types.ts`
- Modify: `frontend/src/core/bff-chat/api.ts`
- Modify: `frontend/src/core/bff-chat/api.test.ts`
- Modify: `frontend/src/app/api/bff/conversation-resource-routes.boundary.test.ts`
- Modify: `frontend/src/components/workspace/recent-chat-list.tsx`
- Modify: `frontend/src/components/workspace/recent-chat-list.boundary.test.ts`
- Modify: `frontend/src/core/i18n/locales/types.ts`
- Modify: `frontend/src/core/i18n/locales/en-US.ts`
- Modify: `frontend/src/core/i18n/locales/zh-CN.ts`

- [ ] **Step 1: Write failing frontend tests for patching pin state and rendering a pinned section**
- [ ] **Step 2: Add pin state to BFF conversation types and patch helper**
- [ ] **Step 3: Add Pin/Unpin menu items and a pinned conversations section in the sidebar**
- [ ] **Step 4: Update localized copy for pinned chats**
- [ ] **Step 5: Re-run targeted frontend tests**

### Task 4: Update docs and verify the shipped behavior

**Files:**
- Modify: `frontend/README.md`
- Modify: `frontend/src/content/en/application/workspace-usage.mdx`
- Modify: `bff/README.md`
- Modify: `bff/docs/API.md`

- [ ] **Step 1: Document the new pin/unpin conversation behavior**
- [ ] **Step 2: Run targeted verification commands**
- [ ] **Step 3: Confirm the final diff covers persistence, API, sidebar UX, and docs**
