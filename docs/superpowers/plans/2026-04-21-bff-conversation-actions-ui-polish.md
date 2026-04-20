# BFF Conversation Actions UI Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the BFF chat sidebar so pin, rename, and delete feel visually native to the existing workspace sidebar rather than like a separate management UI.

**Architecture:** Keep the existing BFF pin/rename/delete behavior and API contracts, but simplify the sidebar rendering back to a single recent-chat list, use a subtle inline pin indicator instead of a dedicated pinned section, and tighten the menu/dialog styling to match the existing sidebar/dialog patterns from `main`.

**Tech Stack:** Next.js App Router, React Query, existing sidebar/dropdown/dialog UI components, node:test boundary tests.

---

### Task 1: Lock the desired UI constraints with regression tests

**Files:**
- Modify: `frontend/src/components/workspace/recent-chat-list.boundary.test.ts`
- Modify: `frontend/src/app/api/bff/conversation-resource-routes.boundary.test.ts`
- Modify: `frontend/src/core/bff-chat/api.test.ts`

- [ ] **Step 1: Add failing assertions for the single-list pinned design**
- [ ] **Step 2: Verify the current UI still fails those assertions**
- [ ] **Step 3: Keep pin/unpin API coverage intact while changing only presentation semantics**

### Task 2: Refactor the BFF sidebar list back to one lightweight list

**Files:**
- Modify: `frontend/src/components/workspace/recent-chat-list.tsx`

- [ ] **Step 1: Remove the dedicated pinned section renderer**
- [ ] **Step 2: Render one sorted list with a subtle inline pin icon for pinned items**
- [ ] **Step 3: Keep menu ordering as Pin/Unpin, Rename, Delete without extra visual weight**
- [ ] **Step 4: Preserve current-route delete fallback navigation and optimistic cache updates**

### Task 3: Tighten dialog and row density to match the existing project style

**Files:**
- Modify: `frontend/src/components/workspace/recent-chat-list.tsx`

- [ ] **Step 1: Reduce visual heaviness in the rename and delete dialogs without changing behavior**
- [ ] **Step 2: Keep the delete confirm action destructive but visually aligned with existing dialogs**
- [ ] **Step 3: Keep row spacing, icon size, and text hierarchy consistent with `main` branch sidebar patterns**

### Task 4: Verify and document the polished behavior

**Files:**
- Modify: `frontend/README.md`
- Modify: `frontend/src/content/en/application/workspace-usage.mdx`

- [ ] **Step 1: Update docs to describe the lighter single-list pin behavior if wording changed materially**
- [ ] **Step 2: Run targeted node tests and file-level lint checks**
- [ ] **Step 3: Confirm the final UI no longer renders a separate pinned block and still supports pin/rename/delete**
