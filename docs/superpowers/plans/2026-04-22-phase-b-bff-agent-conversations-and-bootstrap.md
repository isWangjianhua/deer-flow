# Phase B BFF Agent Conversations And Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Agent Chat and the new-agent bootstrap save flow from legacy browser-visible `thread_id` semantics onto the BFF-owned `conversation_id` model, with `agent_name` stored on conversations and injected by the BFF stream layer.

**Architecture:** Extend the existing BFF `conversations` persistence model with nullable `agent_name`, add an authenticated `POST /agents/{agent_name}/conversations` route, and teach the shared `/conversations/{conversation_id}/messages/stream` route to inject stored `agent_name` into DeerFlow runtime context. On the frontend, reuse the existing `core/bff-chat/*` stack for agent conversations, add an agent-conversation creation bridge, route recent-list links by `agent_name`, and move bootstrap/save behavior onto the BFF-backed agent chat page.

**Tech Stack:** FastAPI, SQLAlchemy, httpx, pytest, Next.js App Router, React 19, TanStack Query, node:test, existing `core/bff-chat` and `core/agents` layers

---

## File Map

- `bff/app/models/conversation.py`
  - Add nullable `agent_name` persistence for agent conversations.
- `bff/app/main.py`
  - Backfill `agent_name` on existing SQLite `conversations` tables during startup.
- `bff/app/schemas/conversation.py`
  - Expose optional `agent_name` on create/list/detail responses.
- `bff/app/services/conversation_service.py`
  - Persist optional `agent_name` when creating conversations and include it in detail responses.
- `bff/app/api/routes/agents.py`
  - Add `POST /agents/{agent_name}/conversations`.
- `bff/app/api/routes/conversations.py`
  - Inject stored `agent_name` into the shared stream context.
- `bff/tests/test_main.py`
  - Verify startup migration backfills `agent_name`.
- `bff/tests/services/test_conversation_service.py`
  - Verify service-layer persistence for agent conversations.
- `bff/tests/api/test_agent_conversation_routes.py`
  - Verify auth and creation behavior for `POST /agents/{agent_name}/conversations`.
- `bff/tests/api/test_conversation_routes.py`
  - Verify list/detail responses expose `agent_name`.
- `bff/tests/api/test_stream_routes.py`
  - Verify stream context merges stored `agent_name`.
- `frontend/src/app/api/bff/agents/[agent_name]/conversations/route.ts`
  - Same-origin bridge for creating agent conversations through the BFF.
- `frontend/src/app/api/bff/agents/route.boundary.test.ts`
  - Verify the new agent-conversation bridge stays BFF-owned.
- `frontend/src/core/bff-chat/types.ts`
  - Add optional `agent_name` to shared BFF conversation types.
- `frontend/src/core/bff-chat/api.ts`
  - Add `createAgentConversation(agentName)` and carry `agent_name` through list/detail calls.
- `frontend/src/core/bff-chat/api.test.ts`
  - Verify agent conversation creation and `agent_name`-aware payloads.
- `frontend/src/core/bff-chat/ui.ts`
  - Add path helpers for normal vs agent conversations.
- `frontend/src/core/bff-chat/ui.test.ts`
  - Verify path helper behavior for main-chat vs agent-chat routes.
- `frontend/src/components/workspace/recent-chat-list.tsx`
  - Route recent items by `agent_name`.
- `frontend/src/components/workspace/recent-chat-list.boundary.test.ts`
  - Verify recent-list routing switches on `agent_name`.
- `frontend/src/app/workspace/agents/[agent_name]/chats/[conversation_id]/page.tsx`
  - Replace the legacy thread-backed agent chat route with a BFF-backed conversation page.
- `frontend/src/app/workspace/agents/new/page.tsx`
  - Stop hosting a bootstrap thread locally; create an agent conversation and redirect into the agent chat route.
- `frontend/src/app/workspace/agents/agent-chat-auth-gate.boundary.test.ts`
  - Verify the agent chat page uses the BFF chat hook, not `useThreadStream()`.
- `frontend/src/app/workspace/agents/agent-create-page.boundary.test.ts`
  - Verify the new-agent page creates an agent conversation before routing into chat.
- `frontend/src/components/workspace/agents/agents-disabled.boundary.test.ts`
  - Point the disabled-route assertions at the new `[conversation_id]` route file.
- `bff/README.md`
  - Document agent conversation creation and stored `agent_name` behavior.
- `frontend/README.md`
  - Document agent chat routes using `conversation_id` and bootstrap handoff through BFF.

### Task 1: Add `agent_name` to BFF conversation persistence, schemas, and startup migration

**Files:**
- Modify: `bff/app/models/conversation.py`
- Modify: `bff/app/main.py`
- Modify: `bff/app/schemas/conversation.py`
- Modify: `bff/app/services/conversation_service.py`
- Modify: `bff/tests/services/test_conversation_service.py`
- Modify: `bff/tests/test_main.py`
- Test: `bff/tests/services/test_conversation_service.py`
- Test: `bff/tests/test_main.py`

- [ ] **Step 1: Write the failing startup migration test for `agent_name`**

Add this assertion to `bff/tests/test_main.py` inside `test_init_db_backfills_conversation_pin_columns`:

```python
        assert "agent_name" in columns
```

Rename the test to match the broader migration scope:

```python
def test_init_db_backfills_conversation_metadata_columns(tmp_path, monkeypatch) -> None:
```

- [ ] **Step 2: Write the failing service test for agent conversation persistence**

Add this test to `bff/tests/services/test_conversation_service.py`:

```python
def test_create_conversation_persists_optional_agent_name(db_session) -> None:
    user = User(username="alice", password_hash="hashed")
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    result = ConversationService(db_session).create_conversation(
        user_id=user.id,
        deerflow_thread_id="thread-agent-123",
        agent_name="demo-agent",
    )
    persisted = ConversationRepository(db_session).get_by_id(result.id)

    assert result.agent_name == "demo-agent"
    assert persisted is not None
    assert persisted.agent_name == "demo-agent"
```

- [ ] **Step 3: Run the focused BFF persistence tests to verify they fail**

Run:

```bash
cd bff && .venv/bin/python -m pytest tests/test_main.py tests/services/test_conversation_service.py -q
```

Expected:

- `tests/test_main.py` fails because `agent_name` is not backfilled
- `tests/services/test_conversation_service.py` fails because `create_conversation()` does not accept `agent_name`

- [ ] **Step 4: Add nullable `agent_name` persistence and response fields**

Update `bff/app/models/conversation.py`:

```python
    agent_name: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
        index=True,
    )
```

Update `bff/app/schemas/conversation.py`:

```python
class ConversationCreateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    status: str
    agent_name: str | None = None
    is_pinned: bool = False
    pinned_at: datetime | None = None
    created_at: datetime
```

```python
class ConversationListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    status: str
    agent_name: str | None = None
    is_pinned: bool = False
    pinned_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
```

```python
class ConversationDetailResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    status: str
    agent_name: str | None = None
    is_pinned: bool = False
    pinned_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    values: ConversationStateValues
```

Update `bff/app/services/conversation_service.py`:

```python
    def create_conversation(
        self,
        user_id: str,
        deerflow_thread_id: str,
        title: str = "New conversation",
        agent_name: str | None = None,
    ) -> ConversationCreateResponse:
        conversation = Conversation(
            user_id=user_id,
            deerflow_thread_id=deerflow_thread_id,
            title=title,
            agent_name=agent_name,
        )
        created = self.repo.create(conversation)
        return ConversationCreateResponse.model_validate(created)
```

```python
        return ConversationDetailResponse(
            id=conversation.id,
            title=conversation.title,
            status=conversation.status,
            agent_name=conversation.agent_name,
            is_pinned=conversation.is_pinned,
            pinned_at=conversation.pinned_at,
            created_at=conversation.created_at,
            updated_at=conversation.updated_at,
            values=latest_values,
        )
```

Update `bff/app/main.py`:

```python
        if "agent_name" not in columns:
            conn.execute(
                text("ALTER TABLE conversations ADD COLUMN agent_name VARCHAR(255)")
            )
```

- [ ] **Step 5: Re-run the focused BFF persistence tests to verify they pass**

Run:

```bash
cd bff && .venv/bin/python -m pytest tests/test_main.py tests/services/test_conversation_service.py -q
```

Expected: PASS with the new `agent_name` column and service persistence.

- [ ] **Step 6: Commit**

```bash
git add bff/app/models/conversation.py bff/app/main.py bff/app/schemas/conversation.py bff/app/services/conversation_service.py bff/tests/services/test_conversation_service.py bff/tests/test_main.py
git commit -m "feat: persist agent name on bff conversations"
```

### Task 2: Add authenticated BFF agent-conversation creation and expose `agent_name` in list/detail contracts

**Files:**
- Modify: `bff/app/api/routes/agents.py`
- Modify: `bff/tests/api/test_conversation_routes.py`
- Create: `bff/tests/api/test_agent_conversation_routes.py`
- Test: `bff/tests/api/test_agent_conversation_routes.py`
- Test: `bff/tests/api/test_conversation_routes.py`

- [ ] **Step 1: Write the failing BFF route tests for agent conversations**

Create `bff/tests/api/test_agent_conversation_routes.py`:

```python
from app.clients.deerflow import DeerFlowClient
from app.core.security import create_access_token


def auth_headers() -> dict[str, str]:
    token = create_access_token("user-123")
    return {"Authorization": f"Bearer {token}"}


def test_create_agent_conversation_requires_auth(client) -> None:
    response = client.post("/agents/demo-agent/conversations")
    assert response.status_code == 401


def test_create_agent_conversation_persists_agent_name(client, monkeypatch) -> None:
    async def fake_create_thread(self) -> str:
        return "thread-agent-123"

    monkeypatch.setattr(DeerFlowClient, "create_thread", fake_create_thread)

    response = client.post(
        "/agents/demo-agent/conversations",
        headers=auth_headers(),
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["agent_name"] == "demo-agent"
    assert payload["title"] == "New conversation"
```

Update `bff/tests/api/test_conversation_routes.py` with one list assertion and one detail assertion:

```python
    assert listed.json()[0]["agent_name"] is None
```

```python
    assert payload["agent_name"] is None
```

Add a new detail test for agent conversations:

```python
def test_get_conversation_detail_returns_agent_name(client, db_session, monkeypatch) -> None:
    async def mock_get_thread_history(self, thread_id: str, limit: int = 1) -> list[dict]:
        return []

    monkeypatch.setattr(DeerFlowClient, "get_thread_history", mock_get_thread_history)

    login = client.post("/auth/login", json={"username": "demo", "password": "demo1234"})
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    me = client.get("/me", headers=headers)
    conversation = ConversationService(db_session).create_conversation(
        user_id=me.json()["id"],
        deerflow_thread_id="thread-agent-456",
        agent_name="demo-agent",
    )

    detail = client.get(f"/conversations/{conversation.id}", headers=headers)

    assert detail.status_code == 200
    assert detail.json()["agent_name"] == "demo-agent"
```

- [ ] **Step 2: Run the BFF route tests to verify they fail**

Run:

```bash
cd bff && .venv/bin/python -m pytest tests/api/test_agent_conversation_routes.py tests/api/test_conversation_routes.py -q
```

Expected:

- `POST /agents/{agent_name}/conversations` fails with `404`
- conversation list/detail assertions fail because `agent_name` is missing

- [ ] **Step 3: Implement `POST /agents/{agent_name}/conversations` and return `agent_name` in conversation responses**

Add this route to `bff/app/api/routes/agents.py`:

```python
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_id, get_db_session
from app.schemas.conversation import ConversationCreateResponse
from app.services.conversation_service import ConversationService
```

```python
@router.post(
    "/agents/{agent_name}/conversations",
    response_model=ConversationCreateResponse,
)
async def create_agent_conversation(
    agent_name: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db_session),
) -> ConversationCreateResponse:
    deerflow_thread_id = await DeerFlowClient().create_thread()
    return ConversationService(db).create_conversation(
        user_id=user_id,
        deerflow_thread_id=deerflow_thread_id,
        agent_name=agent_name,
    )
```

No extra list-route code should be added in `bff/app/api/routes/conversations.py`; the updated response models from Task 1 should already surface `agent_name` through `ConversationListItem.model_validate(...)`.

- [ ] **Step 4: Re-run the BFF route tests to verify they pass**

Run:

```bash
cd bff && .venv/bin/python -m pytest tests/api/test_agent_conversation_routes.py tests/api/test_conversation_routes.py -q
```

Expected: PASS with authenticated agent-conversation creation and `agent_name` exposed on list/detail responses.

- [ ] **Step 5: Commit**

```bash
git add bff/app/api/routes/agents.py bff/tests/api/test_agent_conversation_routes.py bff/tests/api/test_conversation_routes.py
git commit -m "feat: add bff agent conversation creation"
```

### Task 3: Inject stored `agent_name` into the shared BFF stream route

**Files:**
- Modify: `bff/app/api/routes/conversations.py`
- Modify: `bff/tests/api/test_stream_routes.py`
- Test: `bff/tests/api/test_stream_routes.py`

- [ ] **Step 1: Write the failing stream test for stored `agent_name` injection**

Add this test to `bff/tests/api/test_stream_routes.py`:

```python
def test_stream_route_injects_stored_agent_name(client, db_session, monkeypatch) -> None:
    _patch_default_stream_settings(monkeypatch)

    class FakeResponse:
        async def aiter_lines(self):
            for line in ["event: end", "data: {}", ""]:
                yield line

        async def aclose(self) -> None:
            return None

    class FakeClient:
        async def aclose(self) -> None:
            return None

    captured = {}

    async def mock_stream_message(self, thread_id: str, message: str, context=None, config=None):
        captured["thread_id"] = thread_id
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
        deerflow_thread_id="thread-agent-owned",
        agent_name="demo-agent",
    )

    response = client.post(
        f"/conversations/{conversation.id}/messages/stream",
        json={"message": "hello"},
        headers=headers,
    )

    assert response.status_code == 200
    assert captured["thread_id"] == "thread-agent-owned"
    assert captured["context"] == {
        "user_id": me.json()["id"],
        "agent_name": "demo-agent",
    }
```

- [ ] **Step 2: Run the stream tests to verify they fail**

Run:

```bash
cd bff && .venv/bin/python -m pytest tests/api/test_stream_routes.py -q
```

Expected: FAIL because the shared stream route currently forwards only user/model context.

- [ ] **Step 3: Merge stored `agent_name` into the normalized stream context**

Update `bff/app/api/routes/conversations.py`:

```python
    normalized_context = {key: value for key, value in context.items() if value is not None}
    if conversation.agent_name:
        normalized_context["agent_name"] = conversation.agent_name

    client, response = await DeerFlowClient().stream_message(
        thread_id=conversation.deerflow_thread_id,
        message=payload.message,
        context=normalized_context or None,
    )
```

Do not read `agent_name` from the request body. The BFF-owned conversation record is the only source of truth in Phase B.

- [ ] **Step 4: Re-run the stream tests to verify they pass**

Run:

```bash
cd bff && .venv/bin/python -m pytest tests/api/test_stream_routes.py -q
```

Expected: PASS, including the new stored-`agent_name` injection case.

- [ ] **Step 5: Commit**

```bash
git add bff/app/api/routes/conversations.py bff/tests/api/test_stream_routes.py
git commit -m "feat: inject agent conversation context in bff stream"
```

### Task 4: Add the frontend BFF agent-conversation bridge and route recent items by `agent_name`

**Files:**
- Create: `frontend/src/app/api/bff/agents/[agent_name]/conversations/route.ts`
- Modify: `frontend/src/app/api/bff/agents/route.boundary.test.ts`
- Modify: `frontend/src/core/bff-chat/types.ts`
- Modify: `frontend/src/core/bff-chat/api.ts`
- Modify: `frontend/src/core/bff-chat/api.test.ts`
- Modify: `frontend/src/core/bff-chat/ui.ts`
- Modify: `frontend/src/core/bff-chat/ui.test.ts`
- Modify: `frontend/src/components/workspace/recent-chat-list.tsx`
- Modify: `frontend/src/components/workspace/recent-chat-list.boundary.test.ts`
- Test: `frontend/src/app/api/bff/agents/route.boundary.test.ts`
- Test: `frontend/src/core/bff-chat/api.test.ts`
- Test: `frontend/src/core/bff-chat/ui.test.ts`
- Test: `frontend/src/components/workspace/recent-chat-list.boundary.test.ts`

- [ ] **Step 1: Write the failing frontend boundary and contract tests**

Extend `frontend/src/app/api/bff/agents/route.boundary.test.ts`:

```typescript
  const createConversationSource = await readSource(
    "./[agent_name]/conversations/route.ts",
  );

  assert.ok(
    createConversationSource.includes("proxyAuthenticatedBffJson"),
    "expected the agent conversation route to use the shared authenticated BFF proxy helper",
  );
  assert.ok(
    createConversationSource.includes("path: `/agents/${agentName}/conversations`"),
    "expected the route to proxy POST /agents/{agent_name}/conversations",
  );
  assert.ok(
    createConversationSource.includes('method: "POST"'),
    "expected the route to POST to the BFF agent conversation endpoint",
  );
```

Update `frontend/src/core/bff-chat/api.test.ts`:

```typescript
const { createAgentConversation } = await import(
  new URL("./api.ts", import.meta.url).href
);

void test("creates an agent conversation through the BFF", async () => {
  const result = await createAgentConversation("demo-agent", async (input, init) => {
    assert.equal(input, "/api/bff/agents/demo-agent/conversations");
    assert.equal(init?.method, "POST");

    return new Response(
      JSON.stringify({
        id: "conversation-1",
        title: "New conversation",
        status: "active",
        agent_name: "demo-agent",
        is_pinned: false,
        pinned_at: null,
        created_at: "2026-04-22T00:00:00Z",
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });

  assert.equal(result.agent_name, "demo-agent");
});
```

Also update the existing list/detail fixtures in `api.test.ts` so they include `agent_name`:

```typescript
          agent_name: "demo-agent",
```

Update `frontend/src/core/bff-chat/ui.test.ts`:

```typescript
const { pathOfConversation } = await import(new URL("./ui.ts", import.meta.url).href);

void test("builds the correct href for normal and agent conversations", () => {
  assert.equal(
    pathOfConversation({ id: "conversation-1", agent_name: null }),
    "/workspace/chats/conversation-1",
  );
  assert.equal(
    pathOfConversation({ id: "conversation-2", agent_name: "demo-agent" }),
    "/workspace/agents/demo-agent/chats/conversation-2",
  );
});
```

Update `frontend/src/components/workspace/recent-chat-list.boundary.test.ts`:

```typescript
  assert.ok(source.includes("pathOfConversation"));
```

- [ ] **Step 2: Run the frontend route/contract tests to verify they fail**

Run:

```bash
cd frontend && node --test src/app/api/bff/agents/route.boundary.test.ts src/core/bff-chat/api.test.ts src/core/bff-chat/ui.test.ts src/components/workspace/recent-chat-list.boundary.test.ts
```

Expected: FAIL because the nested agent-conversation bridge, `createAgentConversation()`, and path helper do not exist yet.

- [ ] **Step 3: Implement the frontend BFF bridge, conversation helper, and `agent_name`-aware routing**

Create `frontend/src/app/api/bff/agents/[agent_name]/conversations/route.ts`:

```typescript
import type { NextRequest } from "next/server";

import { proxyAuthenticatedBffJson } from "@/server/bff/proxy";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ agent_name: string }> },
) {
  const { agent_name: agentName } = await context.params;
  return proxyAuthenticatedBffJson(request, {
    path: `/agents/${agentName}/conversations`,
    method: "POST",
  });
}
```

Update `frontend/src/core/bff-chat/types.ts`:

```typescript
export type BffConversation = {
  id: string;
  title: string | null;
  agent_name: string | null;
  is_pinned: boolean;
  pinned_at: string | null;
  created_at: string;
  updated_at: string;
};
```

Update `frontend/src/core/bff-chat/api.ts`:

```typescript
export async function createAgentConversation(
  agentName: string,
  fetchImpl: FetchLike = fetch,
) {
  const response = await fetchImpl(
    `/api/bff/agents/${encodeURIComponent(agentName)}/conversations`,
    {
      method: "POST",
      headers: buildRequestHeaders(),
    },
  );

  if (!response.ok) {
    throw new Error("Failed to create agent conversation");
  }

  return (await response.json()) as CreateConversationResult;
}
```

Update `frontend/src/core/bff-chat/ui.ts`:

```typescript
export function pathOfConversation(conversation: {
  id: string;
  agent_name?: string | null;
}) {
  return conversation.agent_name
    ? `/workspace/agents/${conversation.agent_name}/chats/${conversation.id}`
    : `/workspace/chats/${conversation.id}`;
}
```

Update `frontend/src/components/workspace/recent-chat-list.tsx`:

```typescript
import { pathOfConversation } from "@/core/bff-chat/ui";
```

```typescript
                const href = pathOfConversation(conversation);
```

```typescript
        const nextHref = nextConversation
          ? pathOfConversation(nextConversation)
          : "/workspace/chats/new";
```

- [ ] **Step 4: Re-run the frontend route/contract tests to verify they pass**

Run:

```bash
cd frontend && node --test src/app/api/bff/agents/route.boundary.test.ts src/core/bff-chat/api.test.ts src/core/bff-chat/ui.test.ts src/components/workspace/recent-chat-list.boundary.test.ts
```

Expected: PASS with the agent-conversation bridge, BFF chat helpers, and recent-list routing in place.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/api/bff/agents/[agent_name]/conversations/route.ts frontend/src/app/api/bff/agents/route.boundary.test.ts frontend/src/core/bff-chat/types.ts frontend/src/core/bff-chat/api.ts frontend/src/core/bff-chat/api.test.ts frontend/src/core/bff-chat/ui.ts frontend/src/core/bff-chat/ui.test.ts frontend/src/components/workspace/recent-chat-list.tsx frontend/src/components/workspace/recent-chat-list.boundary.test.ts
git commit -m "feat: add frontend agent conversation bff helpers"
```

### Task 5: Replace the legacy thread-backed agent chat page with a BFF-backed conversation route

**Files:**
- Create: `frontend/src/app/workspace/agents/[agent_name]/chats/[conversation_id]/page.tsx`
- Delete: `frontend/src/app/workspace/agents/[agent_name]/chats/[thread_id]/page.tsx`
- Modify: `frontend/src/app/workspace/agents/agent-chat-auth-gate.boundary.test.ts`
- Modify: `frontend/src/components/workspace/agents/agents-disabled.boundary.test.ts`
- Modify: `frontend/src/core/bff-chat/hooks.ts`
- Test: `frontend/src/app/workspace/agents/agent-chat-auth-gate.boundary.test.ts`

- [ ] **Step 1: Write the failing boundary tests for the new agent chat route**

Update `frontend/src/app/workspace/agents/agent-chat-auth-gate.boundary.test.ts`:

```typescript
  const source = await readFile(
    new URL("./[agent_name]/chats/[conversation_id]/page.tsx", import.meta.url),
    "utf8",
  );

  assert.ok(source.includes("useLoginRequiredSubmit"));
  assert.ok(source.includes("useBffThreadStream"));
  assert.ok(source.includes("saveCommandMessage"));
  assert.ok(source.includes("bootstrapRequested"));
  assert.ok(!source.includes("useThreadStream"));
```

Update `frontend/src/components/workspace/agents/agents-disabled.boundary.test.ts` so the agent-chat route path changes from `[thread_id]` to `[conversation_id]`.

- [ ] **Step 2: Run the boundary tests to verify they fail**

Run:

```bash
cd frontend && node --test src/app/workspace/agents/agent-chat-auth-gate.boundary.test.ts src/components/workspace/agents/agents-disabled.boundary.test.ts
```

Expected: FAIL because the new `[conversation_id]` route does not exist yet.

- [ ] **Step 3: Implement the BFF-backed agent conversation page**

Create `frontend/src/app/workspace/agents/[agent_name]/chats/[conversation_id]/page.tsx` by adapting the current page to `useBffThreadStream()`:

```typescript
"use client";

import { BotIcon, PlusSquare, SaveIcon } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { useLoginRequiredSubmit } from "@/components/auth/use-login-required-submit";
import { Button } from "@/components/ui/button";
import { AgentWelcome } from "@/components/workspace/agent-welcome";
import { ArtifactTrigger } from "@/components/workspace/artifacts";
import { ChatBox } from "@/components/workspace/chats";
import { ExportTrigger } from "@/components/workspace/export-trigger";
import { InputBox } from "@/components/workspace/input-box";
import { MessageList } from "@/components/workspace/messages";
import { ThreadContext } from "@/components/workspace/messages/context";
import { ThreadTitle } from "@/components/workspace/thread-title";
import { TodoList } from "@/components/workspace/todo-list";
import { TokenUsageIndicator } from "@/components/workspace/token-usage-indicator";
import { useAgent } from "@/core/agents";
import { isAgentsUiEnabled } from "@/core/agents/feature";
import { useBffThreadStream } from "@/core/bff-chat";
import { useI18n } from "@/core/i18n/hooks";
import { useNotification } from "@/core/notification/hooks";
import { useThreadSettings } from "@/core/settings";
import { cn } from "@/lib/utils";
```

Key behavior in the new page:

```typescript
  const { agent_name: agentName } = useParams<{ agent_name: string }>();
  const { conversation_id: conversationIdFromPath } = useParams<{
    agent_name: string;
    conversation_id: string;
  }>();
  const searchParams = useSearchParams();
  const bootstrapRequested = searchParams.get("bootstrap") === "1";
  const [settings, setSettings] = useThreadSettings(conversationIdFromPath);
  const bootstrapSentRef = useRef(false);

  const [thread, sendMessage, isUploading] = useBffThreadStream({
    conversationId: conversationIdFromPath === "new" ? undefined : conversationIdFromPath,
    context: settings.context,
    onStart: (createdConversationId) => {
      history.replaceState(
        null,
        "",
        `/workspace/agents/${agentName}/chats/${createdConversationId}`,
      );
    },
  });
```

Add bootstrap auto-send on first load:

```typescript
  useEffect(() => {
    if (!bootstrapRequested || bootstrapSentRef.current) {
      return;
    }
    if (conversationIdFromPath === "new" || thread.isThreadLoading) {
      return;
    }
    if (thread.messages.length > 0) {
      history.replaceState(
        null,
        "",
        `/workspace/agents/${agentName}/chats/${conversationIdFromPath}`,
      );
      bootstrapSentRef.current = true;
      return;
    }

    bootstrapSentRef.current = true
    void sendMessage(conversationIdFromPath, {
      text: t.agents.nameStepBootstrapMessage.replace("{name}", agentName),
      files: [],
    }).finally(() => {
      history.replaceState(
        null,
        "",
        `/workspace/agents/${agentName}/chats/${conversationIdFromPath}`,
      );
    });
  }, [
    agentName,
    bootstrapRequested,
    conversationIdFromPath,
    sendMessage,
    t.agents.nameStepBootstrapMessage,
    thread.isThreadLoading,
    thread.messages.length,
  ]);
```

Port the save command from the old bootstrap page onto this page:

```typescript
  const handleSaveAgent = useCallback(async () => {
    if (thread.isLoading) return;
    await sendMessage(conversationIdFromPath, {
      text: t.agents.saveCommandMessage,
      files: [],
    }, { optimistic: false });
    toast.success(t.agents.saveRequested);
  }, [
    conversationIdFromPath,
    sendMessage,
    t.agents.saveCommandMessage,
    t.agents.saveRequested,
    thread.isLoading,
  ]);
```

Update `frontend/src/core/bff-chat/hooks.ts` so it can power bootstrap/save on the agent page without forcing a legacy hook:

```typescript
type SendBffThreadMessageOptions = {
  optimistic?: boolean;
};
```

```typescript
  const sendMessage = useCallback(
    async (
      _conversationId: string,
      message: PromptInputMessage,
      options: SendBffThreadMessageOptions = {},
    ) => {
      const optimistic = options.optimistic ?? true;
      ...
      if (optimistic) {
        setHumanMessages((current) =>
          current.concat(createHumanMessage(text, optimisticFiles, humanMessageId)),
        );
      }
```

```typescript
      } catch (streamError) {
        if (optimistic) {
          setHumanMessages((current) =>
            current.filter((entry) => entry.id !== humanMessageId),
          );
        }
```

Use `apiMode="bff"` in the thread context:

```typescript
    <ThreadContext.Provider value={{ thread, isMock: false, apiMode: "bff" }}>
```

- [ ] **Step 4: Re-run the boundary tests to verify they pass**

Run:

```bash
cd frontend && node --test src/app/workspace/agents/agent-chat-auth-gate.boundary.test.ts src/components/workspace/agents/agents-disabled.boundary.test.ts
```

Expected: PASS with the new BFF-backed `[conversation_id]` route.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/workspace/agents/[agent_name]/chats/[conversation_id]/page.tsx frontend/src/app/workspace/agents/agent-chat-auth-gate.boundary.test.ts frontend/src/components/workspace/agents/agents-disabled.boundary.test.ts frontend/src/core/bff-chat/hooks.ts
git commit -m "feat: move agent chat onto bff conversations"
```

### Task 6: Convert the new-agent page into an agent-conversation bootstrap handoff

**Files:**
- Modify: `frontend/src/app/workspace/agents/new/page.tsx`
- Modify: `frontend/src/app/workspace/agents/agent-create-page.boundary.test.ts`
- Test: `frontend/src/app/workspace/agents/agent-create-page.boundary.test.ts`

- [ ] **Step 1: Write the failing boundary test for bootstrap handoff**

Update `frontend/src/app/workspace/agents/agent-create-page.boundary.test.ts`:

```typescript
  assert.ok(source.includes("checkAgentName"));
  assert.ok(source.includes("createAgent"));
  assert.ok(source.includes("createAgentConversation"));
  assert.ok(source.includes('router.push(`/workspace/agents/${trimmed}/chats/${conversation.id}?bootstrap=1`)'));
  assert.ok(!source.includes("useThreadStream"));
```

- [ ] **Step 2: Run the boundary test to verify it fails**

Run:

```bash
cd frontend && node --test src/app/workspace/agents/agent-create-page.boundary.test.ts
```

Expected: FAIL because the page still hosts its own legacy bootstrap thread.

- [ ] **Step 3: Replace the local bootstrap thread flow with BFF conversation creation + redirect**

Update `frontend/src/app/workspace/agents/new/page.tsx`:

```typescript
import { createAgentConversation } from "@/core/bff-chat";
```

Remove these imports:

```typescript
import { ArtifactsProvider } from "@/components/workspace/artifacts";
import { MessageList } from "@/components/workspace/messages";
import { ThreadContext } from "@/components/workspace/messages/context";
import { useThreadStream } from "@/core/threads/hooks";
import { uuid } from "@/core/utils/uuid";
```

After `createAgent(...)`, create a BFF conversation and redirect:

```typescript
    let conversation;
    try {
      conversation = await createAgentConversation(trimmed);
    } catch (err) {
      setNameError(
        getCreateAgentErrorMessage(
          err,
          t.agents.nameStepNetworkError,
          t.agents.nameStepCheckError,
        ),
      );
      return;
    }

    router.push(
      `/workspace/agents/${trimmed}/chats/${conversation.id}?bootstrap=1`,
    );
```

The page should now return only the name-entry UI in its enabled state; delete the old `step === "chat"` branch entirely.

- [ ] **Step 4: Re-run the boundary test to verify it passes**

Run:

```bash
cd frontend && node --test src/app/workspace/agents/agent-create-page.boundary.test.ts
```

Expected: PASS with the new handoff flow.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/workspace/agents/new/page.tsx frontend/src/app/workspace/agents/agent-create-page.boundary.test.ts
git commit -m "refactor: hand off new agents to bff conversations"
```

### Task 7: Update docs and run focused Phase B verification

**Files:**
- Modify: `bff/README.md`
- Modify: `frontend/README.md`
- Test: `bff/tests/test_main.py`
- Test: `bff/tests/services/test_conversation_service.py`
- Test: `bff/tests/api/test_agent_conversation_routes.py`
- Test: `bff/tests/api/test_conversation_routes.py`
- Test: `bff/tests/api/test_stream_routes.py`
- Test: `frontend/src/app/api/bff/agents/route.boundary.test.ts`
- Test: `frontend/src/core/bff-chat/api.test.ts`
- Test: `frontend/src/core/bff-chat/ui.test.ts`
- Test: `frontend/src/components/workspace/recent-chat-list.boundary.test.ts`
- Test: `frontend/src/app/workspace/agents/agent-create-page.boundary.test.ts`
- Test: `frontend/src/app/workspace/agents/agent-chat-auth-gate.boundary.test.ts`
- Test: `frontend/src/components/workspace/agents/agents-disabled.boundary.test.ts`

- [ ] **Step 1: Update the docs for the Phase B boundary**

Add this section to `bff/README.md`:

```md
## Agent Conversations (Phase B)

The BFF now supports `POST /agents/{agent_name}/conversations` and stores
nullable `agent_name` on each conversation record. Shared conversation list,
detail, and stream routes remain BFF-owned; when a stored conversation carries
`agent_name`, the BFF injects it into DeerFlow runtime context during
`/conversations/{conversation_id}/messages/stream`.
```

Update `frontend/README.md` so the runtime boundary section says:

```md
- browser Agent CRUD and agent conversation creation now go through `/api/bff/agents*`
- agent chat routes now use `/workspace/agents/{agent_name}/chats/{conversation_id}`
- the new-agent bootstrap flow creates a BFF conversation and hands off into the agent chat route
- Agents UI can stay hidden behind the feature flag while Phase C ownership work remains incomplete
```

- [ ] **Step 2: Run the focused BFF verification suite**

Run:

```bash
cd bff && .venv/bin/python -m pytest tests/test_main.py tests/services/test_conversation_service.py tests/api/test_agent_conversation_routes.py tests/api/test_conversation_routes.py tests/api/test_stream_routes.py -q
```

Expected: PASS.

- [ ] **Step 3: Run the focused frontend verification suite**

Run:

```bash
cd frontend && node --test src/app/api/bff/agents/route.boundary.test.ts src/core/bff-chat/api.test.ts src/core/bff-chat/ui.test.ts src/components/workspace/recent-chat-list.boundary.test.ts src/app/workspace/agents/agent-create-page.boundary.test.ts src/app/workspace/agents/agent-chat-auth-gate.boundary.test.ts src/components/workspace/agents/agents-disabled.boundary.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run lint and typecheck on the changed frontend files**

Run:

```bash
cd frontend && pnpm exec eslint \
  src/app/api/bff/agents/[agent_name]/conversations/route.ts \
  src/app/api/bff/agents/route.boundary.test.ts \
  src/core/bff-chat/types.ts \
  src/core/bff-chat/api.ts \
  src/core/bff-chat/api.test.ts \
  src/core/bff-chat/ui.ts \
  src/core/bff-chat/ui.test.ts \
  src/core/bff-chat/hooks.ts \
  src/components/workspace/recent-chat-list.tsx \
  src/components/workspace/recent-chat-list.boundary.test.ts \
  src/app/workspace/agents/[agent_name]/chats/[conversation_id]/page.tsx \
  src/app/workspace/agents/new/page.tsx \
  src/app/workspace/agents/agent-create-page.boundary.test.ts \
  src/app/workspace/agents/agent-chat-auth-gate.boundary.test.ts \
  src/components/workspace/agents/agents-disabled.boundary.test.ts
```

Expected: PASS.

Run:

```bash
cd frontend && pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add bff/README.md frontend/README.md
git commit -m "docs: describe phase-b agent conversations boundary"
```

## Self-Review

### Spec coverage

- Phase B persistence and migration for `conversation.agent_name` are covered in Task 1.
- `POST /agents/{agent_name}/conversations` plus list/detail `agent_name` exposure are covered in Task 2.
- Shared stream-route `agent_name` injection is covered in Task 3.
- Frontend BFF bridges, shared conversation helpers, and recent-list route switching are covered in Task 4.
- Agent chat route migration from `thread_id` to `conversation_id` is covered in Task 5.
- New-agent bootstrap handoff through a BFF conversation is covered in Task 6.
- Docs plus end-of-phase verification are covered in Task 7.

### Placeholder scan

Run after saving the plan:

```bash
rg -n "T[B]D|T[O]DO|implement[[:space:]]later|fill[[:space:]]in[[:space:]]details|appropriate[[:space:]]error[[:space:]]handling|write[[:space:]]tests[[:space:]]for[[:space:]]the[[:space:]]above|similar[[:space:]]to[[:space:]]Task" docs/superpowers/plans/2026-04-22-phase-b-bff-agent-conversations-and-bootstrap.md
```

Expected: no output.

### Type consistency

- BFF conversation responses use the same field name everywhere: `agent_name`.
- The new browser route uses `conversation_id`, while the BFF still maps internally to `deerflow_thread_id`.
- The recent-list path helper routes by `{ id, agent_name }`, not by legacy `thread_id`.
- The new-agent page creates the agent conversation through `createAgentConversation(agentName)` before redirecting into the agent chat route.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-22-phase-b-bff-agent-conversations-and-bootstrap.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
