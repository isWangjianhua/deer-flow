# BFF Conversation Rename/Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add product-visible rename and true delete actions for each BFF-backed recent conversation, deleting both the public conversation record and the mapped DeerFlow thread data.

**Architecture:** Keep `conversation_id` as the only browser-visible identifier. Add ownership-aware `PATCH` and `DELETE` conversation endpoints in the BFF, proxy them through same-origin Next.js routes, and wire the sidebar list to use those actions with React Query cache updates and active-route fallback navigation.

**Tech Stack:** FastAPI, SQLAlchemy, Next.js route handlers, React Query, existing workspace sidebar UI.

---

### Task 1: Define BFF conversation lifecycle contract

**Files:**
- Modify: `bff/app/schemas/conversation.py`
- Modify: `bff/app/api/routes/conversations.py`
- Modify: `bff/README.md`

- [ ] **Step 1: Add request/response schemas for rename and delete**

```python
class ConversationRenameRequest(BaseModel):
    title: str


class ConversationDeleteResponse(BaseModel):
    success: bool
    id: str
```

- [ ] **Step 2: Expose `PATCH /conversations/{conversation_id}` and `DELETE /conversations/{conversation_id}`**

```python
@router.patch("/{conversation_id}", response_model=ConversationDetailResponse)
async def rename_conversation(...):
    ...


@router.delete("/{conversation_id}", response_model=ConversationDeleteResponse)
async def delete_conversation(...):
    ...
```

- [ ] **Step 3: Document the new public routes**

Update `bff/README.md` public route table to include rename/delete, and note that delete also removes the mapped DeerFlow thread.

### Task 2: Add service/repository support with ownership-aware hard delete

**Files:**
- Modify: `bff/app/repositories/conversation_repo.py`
- Modify: `bff/app/services/conversation_service.py`
- Modify: `bff/app/clients/deerflow.py`
- Test: `bff/tests/services/test_conversation_service.py`

- [ ] **Step 1: Write failing service tests for rename and delete**

```python
def test_rename_conversation_updates_owned_title(...):
    ...


@pytest.mark.asyncio
async def test_delete_conversation_removes_record_after_thread_cleanup(...):
    ...
```

- [ ] **Step 2: Add repository delete support**

```python
def delete(self, conversation: Conversation) -> None:
    self.db.delete(conversation)
    self.db.commit()
```

- [ ] **Step 3: Add DeerFlow client thread-delete helper**

```python
async def delete_thread(self, thread_id: str) -> dict:
    async with httpx.AsyncClient(timeout=self.timeout) as client:
        response = await client.delete(f"{self.base_url}/api/threads/{thread_id}")
        response.raise_for_status()
        return response.json()
```

- [ ] **Step 4: Implement service rename and delete methods**

```python
def rename_conversation(...):
    ...


async def delete_conversation(...):
    ...
```

Delete order: verify ownership -> call DeerFlow thread delete -> remove DB conversation row -> return stable response.

### Task 3: Prove BFF API behavior end-to-end

**Files:**
- Modify: `bff/tests/api/test_conversation_routes.py`

- [ ] **Step 1: Write failing API tests for auth, rename, and delete**

```python
def test_rename_conversation_updates_owned_title(...):
    ...


def test_delete_conversation_removes_owned_mapping(...):
    ...
```

- [ ] **Step 2: Run targeted BFF tests to see failures**

Run: `uv run pytest bff/tests/services/test_conversation_service.py bff/tests/api/test_conversation_routes.py -q`
Expected: failing tests for missing rename/delete contract.

- [ ] **Step 3: Implement minimal BFF code until tests pass**

Use the route/service/repository/client changes from Tasks 1-2.

- [ ] **Step 4: Re-run the targeted BFF tests**

Run: `uv run pytest bff/tests/services/test_conversation_service.py bff/tests/api/test_conversation_routes.py -q`
Expected: all targeted rename/delete tests pass.

### Task 4: Add same-origin frontend bridge support

**Files:**
- Modify: `frontend/src/app/api/bff/conversations/[conversation_id]/route.ts`
- Modify: `frontend/src/app/api/bff/conversation-resource-routes.boundary.test.ts`
- Modify: `frontend/src/core/bff-chat/api.ts`
- Modify: `frontend/src/core/bff-chat/api.test.ts`
- Modify: `frontend/src/core/bff-chat/api-boundary.test.ts`

- [ ] **Step 1: Write failing frontend API tests for rename/delete helpers**

```ts
await renameConversation("conv-1", "Renamed chat", mockFetch)
await deleteConversation("conv-1", mockFetch)
```

- [ ] **Step 2: Add same-origin `PATCH` and `DELETE` proxy handlers**

```ts
export async function PATCH(...) { ... }
export async function DELETE(...) { ... }
```

- [ ] **Step 3: Add browser helpers**

```ts
export async function renameConversation(conversationId: string, title: string, ...)
export async function deleteConversation(conversationId: string, ...)
```

- [ ] **Step 4: Re-run targeted frontend API tests**

Run: `pnpm exec vitest run frontend/src/core/bff-chat/api.test.ts`
Expected: rename/delete API tests pass.

### Task 5: Expose rename/delete in the recent-chat sidebar

**Files:**
- Modify: `frontend/src/components/workspace/recent-chat-list.tsx`
- Modify: `frontend/src/content/en/application/workspace-usage.mdx`
- Modify: `frontend/README.md`

- [ ] **Step 1: Reuse the existing sidebar dropdown pattern for BFF conversations**

Add `MoreHorizontal`, rename dialog state, and delete action to `BffRecentChatList` so each conversation row behaves like the legacy thread list.

- [ ] **Step 2: Keep cache and navigation consistent after rename/delete**

Use React Query mutation success handlers to update `['bff', 'conversations']`, and if the active conversation is deleted navigate to the next conversation or `/workspace/chats/new`.

- [ ] **Step 3: Update user-facing docs**

Replace the “rename/delete not yet exposed” limitation text with the new sidebar actions in the workspace docs and frontend README.

### Task 6: Verify the shipped behavior

**Files:**
- Modify: `docs/superpowers/plans/2026-04-20-bff-conversation-rename-delete.md`

- [ ] **Step 1: Run targeted verification commands**

Run: `uv run pytest bff/tests/services/test_conversation_service.py bff/tests/api/test_conversation_routes.py -q`
Expected: pass

Run: `pnpm exec vitest run frontend/src/core/bff-chat/api.test.ts frontend/src/app/api/bff/conversation-resource-routes.boundary.test.ts frontend/src/core/bff-chat/api-boundary.test.ts`
Expected: pass

- [ ] **Step 2: Confirm plan coverage**

Check that the final diff includes:
- BFF ownership-aware rename/delete contract
- DeerFlow thread hard delete on BFF delete
- frontend same-origin bridge support
- sidebar rename/delete UI
- docs updates
