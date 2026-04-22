# Phase C Agents Ownership And Product Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the `Agents` product so agent CRUD, agent conversations, recent-list routing, and the visible UI are all user-scoped and safe to reopen.

**Architecture:** Add a BFF-owned `agent_ownerships` table that maps `agent_name` to `owner_user_id`, then route all browser-facing agent reads and writes through that ownership layer before touching downstream Gateway APIs. Reuse the existing BFF conversation ownership model, add an agent-access consistency check for any conversation carrying `agent_name`, then reopen the frontend `Agents` UI with a single recent list that shows lightweight agent labeling and routes agent conversations back to the agent chat path.

**Tech Stack:** FastAPI, SQLAlchemy, httpx, pytest, Next.js App Router, React 19, TanStack Query, node:test, existing `core/bff-chat`, `core/agents`, and sidebar UI components

---

## File Map

- `bff/app/models/agent_ownership.py`
  - New persistence model mapping `agent_name` to the owning BFF `user_id`.
- `bff/app/db/base.py`
  - Register the new ownership model with SQLAlchemy metadata.
- `bff/app/main.py`
  - Backfill the new `agent_ownerships` table on startup for local/dev databases.
- `bff/app/repositories/agent_ownership_repo.py`
  - CRUD/select helpers for owned agent names.
- `bff/app/services/agent_ownership_service.py`
  - Ownership-aware orchestration for list/get/check/create/update/delete agent operations.
- `bff/app/api/routes/agents.py`
  - Switch routes from raw DeerFlow client calls to the ownership-aware service.
- `bff/app/services/conversation_service.py`
  - Enforce agent visibility consistency for conversations with `agent_name`.
- `bff/app/api/routes/conversations.py`
  - Reuse the stricter conversation ownership check before detail/patch/delete/stream.
- `bff/tests/test_main.py`
  - Verify startup creates the new ownership table.
- `bff/tests/repositories/test_agent_ownership_repo.py`
  - Verify ownership persistence helpers.
- `bff/tests/services/test_agent_ownership_service.py`
  - Verify agent CRUD ownership filtering and authorization behavior.
- `bff/tests/api/test_agent_routes.py`
  - Verify `/agents*` now behaves user-scoped.
- `bff/tests/api/test_conversation_routes.py`
  - Verify agent conversations reject invisible/unowned agents.
- `bff/tests/api/test_stream_routes.py`
  - Verify stream route rejects agent conversations whose `agent_name` is not visible to the current user.
- `frontend/src/core/agents/feature.ts`
  - Reopen the `Agents` UI after ownership safeguards exist.
- `frontend/src/components/workspace/workspace-nav-chat-list.tsx`
  - Keep the sidebar `Agents` entry visible again.
- `frontend/src/components/workspace/agents/agents-disabled.boundary.test.ts`
  - Replace “hidden/disabled” expectations with “visible/reopened” expectations.
- `frontend/src/components/workspace/recent-chat-list.tsx`
  - Add lightweight agent labeling to agent conversation rows in the unified recent list.
- `frontend/src/components/workspace/recent-chat-list.boundary.test.ts`
  - Verify the unified recent list still uses shared path generation and renders agent indicators.
- `frontend/src/components/workspace/agents/agent-card.tsx`
  - Keep “chat” entry points aligned with the reopened agent route semantics.
- `frontend/src/app/workspace/agents/page.tsx`
  - Reuse the existing `AgentGallery` once the feature flag is enabled.
- `frontend/src/app/workspace/agents/new/page.tsx`
  - Reuse the Phase B handoff flow with reopened UI.
- `bff/README.md`
  - Document agent ownership and reopen conditions.
- `frontend/README.md`
  - Document that the visible `Agents` UI is Phase C-gated by BFF ownership.

### Task 1: Add BFF-owned agent ownership persistence and startup migration

**Files:**
- Create: `bff/app/models/agent_ownership.py`
- Modify: `bff/app/db/base.py`
- Modify: `bff/app/main.py`
- Create: `bff/app/repositories/agent_ownership_repo.py`
- Modify: `bff/tests/test_main.py`
- Create: `bff/tests/repositories/test_agent_ownership_repo.py`
- Test: `bff/tests/test_main.py`
- Test: `bff/tests/repositories/test_agent_ownership_repo.py`

- [ ] **Step 1: Write the failing startup and repository tests**

Create `bff/tests/repositories/test_agent_ownership_repo.py`:

```python
from app.models.agent_ownership import AgentOwnership
from app.repositories.agent_ownership_repo import AgentOwnershipRepository
from app.models.user import User


def test_create_and_read_agent_ownership(db_session) -> None:
    user = User(username="alice", password_hash="hashed")
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    repo = AgentOwnershipRepository(db_session)
    repo.create(
        AgentOwnership(agent_name="demo-agent", owner_user_id=user.id)
    )

    ownership = repo.get_by_agent_name("demo-agent")

    assert ownership is not None
    assert ownership.owner_user_id == user.id


def test_list_agent_names_by_owner(db_session) -> None:
    alice = User(username="alice", password_hash="hashed")
    bob = User(username="bob", password_hash="hashed")
    db_session.add_all([alice, bob])
    db_session.commit()
    db_session.refresh(alice)
    db_session.refresh(bob)

    repo = AgentOwnershipRepository(db_session)
    repo.create(AgentOwnership(agent_name="alice-agent", owner_user_id=alice.id))
    repo.create(AgentOwnership(agent_name="bob-agent", owner_user_id=bob.id))

    assert repo.list_agent_names_by_owner(alice.id) == ["alice-agent"]
```

Update `bff/tests/test_main.py` by renaming the existing metadata test and adding a new table assertion:

```python
def test_init_db_backfills_agent_and_conversation_metadata(tmp_path, monkeypatch) -> None:
```

Add this assertion after `app_main.init_db()`:

```python
        table_names = set(inspect(engine).get_table_names())
        assert "agent_ownerships" in table_names
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run:

```bash
cd bff && .venv/bin/python -m pytest tests/test_main.py tests/repositories/test_agent_ownership_repo.py -q
```

Expected:

- repository test import fails because `AgentOwnership` and its repo do not exist
- startup test fails because `agent_ownerships` is not created

- [ ] **Step 3: Implement the ownership model, repo, and startup table creation**

Create `bff/app/models/agent_ownership.py`:

```python
from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AgentOwnership(Base):
    __tablename__ = "agent_ownerships"
    __table_args__ = (
        UniqueConstraint("agent_name", name="uq_agent_ownerships_agent_name"),
    )

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    agent_name: Mapped[str] = mapped_column(String(255), index=True)
    owner_user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id"),
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )
```

Update `bff/app/db/base.py` so metadata imports the new model:

```python
from app.models.agent_ownership import AgentOwnership  # noqa: F401
from app.models.conversation import Conversation  # noqa: F401
from app.models.user import User  # noqa: F401
```

Create `bff/app/repositories/agent_ownership_repo.py`:

```python
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.agent_ownership import AgentOwnership


class AgentOwnershipRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create(self, ownership: AgentOwnership) -> AgentOwnership:
        self.db.add(ownership)
        self.db.commit()
        self.db.refresh(ownership)
        return ownership

    def get_by_agent_name(self, agent_name: str) -> AgentOwnership | None:
        statement = select(AgentOwnership).where(
            AgentOwnership.agent_name == agent_name,
        )
        return self.db.scalar(statement)

    def list_agent_names_by_owner(self, owner_user_id: str) -> list[str]:
        statement = (
            select(AgentOwnership.agent_name)
            .where(AgentOwnership.owner_user_id == owner_user_id)
            .order_by(AgentOwnership.agent_name.asc())
        )
        return list(self.db.scalars(statement))

    def delete(self, ownership: AgentOwnership) -> None:
        self.db.delete(ownership)
        self.db.commit()
```

Update `bff/app/main.py` with a new startup helper:

```python
def ensure_agent_ownership_schema() -> None:
    inspector = inspect(engine)
    if "agent_ownerships" in inspector.get_table_names():
        return

    Base.metadata.create_all(bind=engine, tables=[AgentOwnership.__table__])
```

Call it from `init_db()` immediately after `Base.metadata.create_all(bind=engine)`.

- [ ] **Step 4: Re-run the focused tests to verify they pass**

Run:

```bash
cd bff && .venv/bin/python -m pytest tests/test_main.py tests/repositories/test_agent_ownership_repo.py -q
```

Expected: PASS with the new ownership table and repository.

- [ ] **Step 5: Commit**

```bash
git add bff/app/models/agent_ownership.py bff/app/db/base.py bff/app/main.py bff/app/repositories/agent_ownership_repo.py bff/tests/test_main.py bff/tests/repositories/test_agent_ownership_repo.py
git commit -m "feat: add bff agent ownership persistence"
```

### Task 2: Make BFF `/agents*` routes ownership-aware

**Files:**
- Create: `bff/app/services/agent_ownership_service.py`
- Modify: `bff/app/api/routes/agents.py`
- Modify: `bff/tests/api/test_agent_routes.py`
- Create: `bff/tests/services/test_agent_ownership_service.py`
- Test: `bff/tests/services/test_agent_ownership_service.py`
- Test: `bff/tests/api/test_agent_routes.py`

- [ ] **Step 1: Write the failing service and API tests**

Create `bff/tests/services/test_agent_ownership_service.py`:

```python
import asyncio
import httpx

from app.clients.deerflow import DeerFlowClient
from app.models.agent_ownership import AgentOwnership
from app.models.user import User
from app.services.agent_ownership_service import AgentOwnershipService


def test_list_agents_filters_to_owned_names(db_session, monkeypatch) -> None:
    user = User(username="alice", password_hash="hashed")
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    db_session.add(
        AgentOwnership(agent_name="owned-agent", owner_user_id=user.id)
    )
    db_session.commit()

    async def fake_list_agents(self) -> dict:
        return {
            "agents": [
                {"name": "owned-agent", "description": "", "model": None, "tool_groups": None, "soul": ""},
                {"name": "other-agent", "description": "", "model": None, "tool_groups": None, "soul": ""},
            ]
        }

    monkeypatch.setattr(DeerFlowClient, "list_agents", fake_list_agents)

    payload = asyncio.run(AgentOwnershipService(db_session).list_agents(user.id))

    assert [agent["name"] for agent in payload["agents"]] == ["owned-agent"]
```

```python
def test_get_agent_rejects_unowned_agent(db_session) -> None:
    user = User(username="alice", password_hash="hashed")
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    service = AgentOwnershipService(db_session)

    try:
        asyncio.run(service.require_owned_agent(user.id, "other-agent"))
    except Exception as exc:
        assert exc.status_code == 404
        assert exc.detail["code"] == "agent_not_found"
    else:
        raise AssertionError("expected require_owned_agent to fail")
```

Add these API tests to `bff/tests/api/test_agent_routes.py`:

```python
def test_list_agents_returns_only_current_users_agents(client, db_session, monkeypatch) -> None:
    async def fake_list_agents(self) -> dict:
        return {
            "agents": [
                {"name": "owned-agent", "description": "", "model": None, "tool_groups": None, "soul": ""},
                {"name": "other-agent", "description": "", "model": None, "tool_groups": None, "soul": ""},
            ]
        }

    monkeypatch.setattr(DeerFlowClient, "list_agents", fake_list_agents)

    login = client.post("/auth/login", json={"username": "demo", "password": "demo1234"})
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    me = client.get("/me", headers=headers)
    db_session.add(AgentOwnership(agent_name="owned-agent", owner_user_id=me.json()["id"]))
    db_session.commit()

    response = client.get("/agents", headers=headers)

    assert response.status_code == 200
    assert [agent["name"] for agent in response.json()["agents"]] == ["owned-agent"]
```

```python
def test_create_agent_binds_new_ownership_record(client, db_session, monkeypatch) -> None:
    async def fake_create_agent(self, payload: dict) -> dict:
        return payload

    monkeypatch.setattr(DeerFlowClient, "create_agent", fake_create_agent)

    login = client.post("/auth/login", json={"username": "demo", "password": "demo1234"})
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    me = client.get("/me", headers=headers)

    response = client.post(
        "/agents",
        headers=headers,
        json={"name": "owned-agent", "description": "", "model": None, "tool_groups": None, "soul": ""},
    )

    assert response.status_code == 200
    ownership = db_session.query(AgentOwnership).filter_by(agent_name="owned-agent").one()
    assert ownership.owner_user_id == me.json()["id"]
```

- [ ] **Step 2: Run the focused service and API tests to verify they fail**

Run:

```bash
cd bff && .venv/bin/python -m pytest tests/services/test_agent_ownership_service.py tests/api/test_agent_routes.py -q
```

Expected:

- imports fail because `AgentOwnershipService` does not exist
- API tests fail because `/agents*` still expose global data

- [ ] **Step 3: Implement an ownership-aware agent service and route wiring**

Create `bff/app/services/agent_ownership_service.py`:

```python
from fastapi import status
from sqlalchemy.orm import Session

from app.api.errors import error_response
from app.clients.deerflow import DeerFlowClient
from app.models.agent_ownership import AgentOwnership
from app.repositories.agent_ownership_repo import AgentOwnershipRepository


class AgentOwnershipService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = AgentOwnershipRepository(db)

    async def list_agents(self, user_id: str) -> dict:
        payload = await DeerFlowClient().list_agents()
        owned_names = set(self.repo.list_agent_names_by_owner(user_id))
        payload["agents"] = [
            agent for agent in payload.get("agents", [])
            if agent.get("name") in owned_names
        ]
        return payload

    async def require_owned_agent(self, user_id: str, agent_name: str) -> AgentOwnership:
        ownership = self.repo.get_by_agent_name(agent_name)
        if ownership is None or ownership.owner_user_id != user_id:
            raise error_response(
                status.HTTP_404_NOT_FOUND,
                "agent_not_found",
                "Agent not found",
            )
        return ownership

    async def get_agent(self, user_id: str, agent_name: str) -> dict:
        await self.require_owned_agent(user_id, agent_name)
        return await DeerFlowClient().get_agent(agent_name)

    async def create_agent(self, user_id: str, payload: dict) -> dict:
        created = await DeerFlowClient().create_agent(payload)
        self.repo.create(
            AgentOwnership(
                agent_name=created["name"],
                owner_user_id=user_id,
            )
        )
        return created

    async def update_agent(self, user_id: str, agent_name: str, payload: dict) -> dict:
        await self.require_owned_agent(user_id, agent_name)
        return await DeerFlowClient().update_agent(agent_name, payload)

    async def delete_agent(self, user_id: str, agent_name: str) -> dict:
        ownership = await self.require_owned_agent(user_id, agent_name)
        result = await DeerFlowClient().delete_agent(agent_name)
        self.repo.delete(ownership)
        return result
```

Update `bff/app/api/routes/agents.py` so CRUD routes use this service:

```python
from app.services.agent_ownership_service import AgentOwnershipService
```

```python
@router.get("/agents")
async def list_agents(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db_session),
) -> dict:
    try:
        return await AgentOwnershipService(db).list_agents(user_id)
    except httpx.HTTPStatusError as exc:
        _normalize_agents_error(exc)
```

Apply the same ownership-aware pattern to `get_agent`, `create_agent`, `update_agent`, and `delete_agent`.

- [ ] **Step 4: Re-run the focused service and API tests to verify they pass**

Run:

```bash
cd bff && .venv/bin/python -m pytest tests/services/test_agent_ownership_service.py tests/api/test_agent_routes.py -q
```

Expected: PASS with user-scoped CRUD semantics.

- [ ] **Step 5: Commit**

```bash
git add bff/app/services/agent_ownership_service.py bff/app/api/routes/agents.py bff/tests/services/test_agent_ownership_service.py bff/tests/api/test_agent_routes.py
git commit -m "feat: enforce agent ownership in bff routes"
```

### Task 3: Enforce agent visibility consistency for conversations and stream access

**Files:**
- Modify: `bff/app/services/conversation_service.py`
- Modify: `bff/tests/api/test_conversation_routes.py`
- Modify: `bff/tests/api/test_stream_routes.py`
- Test: `bff/tests/api/test_conversation_routes.py`
- Test: `bff/tests/api/test_stream_routes.py`

- [ ] **Step 1: Write the failing conversation-visibility tests**

Add this to `bff/tests/api/test_conversation_routes.py`:

```python
def test_get_conversation_detail_rejects_invisible_agent_conversation(client, db_session, monkeypatch) -> None:
    async def mock_get_thread_history(self, thread_id: str, limit: int = 1) -> list[dict]:
        return []

    monkeypatch.setattr(DeerFlowClient, "get_thread_history", mock_get_thread_history)

    login = client.post("/auth/login", json={"username": "demo", "password": "demo1234"})
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    me = client.get("/me", headers=headers)
    conversation = ConversationService(db_session).create_conversation(
        user_id=me.json()["id"],
        deerflow_thread_id="thread-agent-hidden",
        agent_name="hidden-agent",
    )

    response = client.get(f"/conversations/{conversation.id}", headers=headers)

    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "agent_not_found"
```

Add this to `bff/tests/api/test_stream_routes.py`:

```python
def test_stream_route_rejects_invisible_agent_conversation(client, db_session) -> None:
    login = client.post("/auth/login", json={"username": "demo", "password": "demo1234"})
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    me = client.get("/me", headers=headers)
    conversation = ConversationService(db_session).create_conversation(
        user_id=me.json()["id"],
        deerflow_thread_id="thread-agent-hidden",
        agent_name="hidden-agent",
    )

    response = client.post(
        f"/conversations/{conversation.id}/messages/stream",
        json={"message": "hello"},
        headers=headers,
    )

    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "agent_not_found"
```

- [ ] **Step 2: Run the focused conversation tests to verify they fail**

Run:

```bash
cd bff && .venv/bin/python -m pytest tests/api/test_conversation_routes.py tests/api/test_stream_routes.py -q
```

Expected: FAIL because conversations currently trust `conversation.user_id` alone.

- [ ] **Step 3: Add agent-visibility enforcement to owned conversation checks**

Update `bff/app/services/conversation_service.py`:

```python
from app.repositories.agent_ownership_repo import AgentOwnershipRepository
```

```python
        self.agent_repo = AgentOwnershipRepository(db)
```

```python
    def _require_visible_agent_name(self, user_id: str, agent_name: str) -> None:
        ownership = self.agent_repo.get_by_agent_name(agent_name)
        if ownership is None or ownership.owner_user_id != user_id:
            raise error_response(
                status.HTTP_404_NOT_FOUND,
                "agent_not_found",
                "Agent not found",
            )
```

```python
    def require_owned_conversation(self, user_id: str, conversation_id: str) -> Conversation:
        conversation = self.repo.get_by_id(conversation_id)
        if conversation is None:
            raise error_response(status.HTTP_404_NOT_FOUND, "conversation_not_found", "Conversation not found")
        if conversation.user_id != user_id:
            raise error_response(status.HTTP_403_FORBIDDEN, "forbidden", "Forbidden")
        if conversation.agent_name:
            self._require_visible_agent_name(user_id, conversation.agent_name)
        return conversation
```

Do not add duplicate route checks in `bff/app/api/routes/conversations.py`; the service guard should remain the single source of truth.

- [ ] **Step 4: Re-run the focused conversation tests to verify they pass**

Run:

```bash
cd bff && .venv/bin/python -m pytest tests/api/test_conversation_routes.py tests/api/test_stream_routes.py -q
```

Expected: PASS with agent visibility consistency enforced.

- [ ] **Step 5: Commit**

```bash
git add bff/app/services/conversation_service.py bff/tests/api/test_conversation_routes.py bff/tests/api/test_stream_routes.py
git commit -m "feat: enforce agent visibility on conversations"
```

### Task 4: Reopen the frontend `Agents` UI and add recent-list agent labeling

**Files:**
- Modify: `frontend/src/core/agents/feature.ts`
- Modify: `frontend/src/components/workspace/workspace-nav-chat-list.tsx`
- Modify: `frontend/src/components/workspace/agents/agents-disabled.boundary.test.ts`
- Modify: `frontend/src/components/workspace/recent-chat-list.tsx`
- Modify: `frontend/src/components/workspace/recent-chat-list.boundary.test.ts`
- Test: `frontend/src/components/workspace/agents/agents-disabled.boundary.test.ts`
- Test: `frontend/src/components/workspace/recent-chat-list.boundary.test.ts`

- [ ] **Step 1: Write the failing frontend boundary expectations for reopened UI**

Update `frontend/src/components/workspace/agents/agents-disabled.boundary.test.ts`:

```typescript
void test("workspace navigation exposes the agents entry once the feature flag is enabled", async () => {
  const source = await readFile(
    new URL("../workspace-nav-chat-list.tsx", import.meta.url),
    "utf8",
  );

  assert.ok(source.includes("isAgentsUiEnabled"));
  assert.ok(
    source.includes('href="/workspace/agents"'),
    "expected workspace navigation to expose the reopened agents area",
  );
});
```

Replace the disabled-route assertions with:

```typescript
void test("agent routes keep the shared feature flag guard but point at live implementations", async () => {
  const galleryPage = await readFile(
    new URL("../../../app/workspace/agents/page.tsx", import.meta.url),
    "utf8",
  );
  const newAgentPage = await readFile(
    new URL("../../../app/workspace/agents/new/page.tsx", import.meta.url),
    "utf8",
  );
  const agentChatPage = await readFile(
    new URL(
      "../../../app/workspace/agents/[agent_name]/chats/[conversation_id]/page.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.ok(galleryPage.includes("AgentGallery"));
  assert.ok(newAgentPage.includes("createAgentConversation"));
  assert.ok(agentChatPage.includes("useBffThreadStream"));
}
```

Update `frontend/src/components/workspace/recent-chat-list.boundary.test.ts`:

```typescript
  assert.ok(source.includes("BotIcon"));
  assert.ok(source.includes("conversation.agent_name"));
```

- [ ] **Step 2: Run the frontend boundary tests to verify they fail**

Run:

```bash
cd frontend && node --test src/components/workspace/agents/agents-disabled.boundary.test.ts src/components/workspace/recent-chat-list.boundary.test.ts
```

Expected: FAIL because the feature flag is still `false` and recent list has no agent label.

- [ ] **Step 3: Reopen the UI and add lightweight agent indicators in recent list**

Update `frontend/src/core/agents/feature.ts`:

```typescript
export function isAgentsUiEnabled() {
  return true;
}
```

Update `frontend/src/components/workspace/recent-chat-list.tsx`:

```typescript
import { BotIcon, MoreHorizontal, Pencil, Pin, PinOff, Trash2 } from "lucide-react";
```

Inside the row rendering block, add a lightweight label:

```typescript
                        {conversation.agent_name ? (
                          <BotIcon className="size-3 shrink-0 opacity-55" />
                        ) : conversation.is_pinned ? (
                          <Pin className="size-3 shrink-0 opacity-55" />
                        ) : null}
                        <span className="truncate">{displayTitle}</span>
```

This keeps the unified list, but lets users visually distinguish agent conversations.

- [ ] **Step 4: Re-run the frontend boundary tests to verify they pass**

Run:

```bash
cd frontend && node --test src/components/workspace/agents/agents-disabled.boundary.test.ts src/components/workspace/recent-chat-list.boundary.test.ts
```

Expected: PASS with visible agents navigation and labeled agent conversations.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/core/agents/feature.ts frontend/src/components/workspace/workspace-nav-chat-list.tsx frontend/src/components/workspace/agents/agents-disabled.boundary.test.ts frontend/src/components/workspace/recent-chat-list.tsx frontend/src/components/workspace/recent-chat-list.boundary.test.ts
git commit -m "feat: reopen agents ui with unified recent list"
```

### Task 5: Update docs and run focused Phase C verification

**Files:**
- Modify: `bff/README.md`
- Modify: `frontend/README.md`
- Test: `bff/tests/test_main.py`
- Test: `bff/tests/repositories/test_agent_ownership_repo.py`
- Test: `bff/tests/services/test_agent_ownership_service.py`
- Test: `bff/tests/api/test_agent_routes.py`
- Test: `bff/tests/api/test_conversation_routes.py`
- Test: `bff/tests/api/test_stream_routes.py`
- Test: `frontend/src/components/workspace/agents/agents-disabled.boundary.test.ts`
- Test: `frontend/src/components/workspace/recent-chat-list.boundary.test.ts`

- [ ] **Step 1: Update docs for Phase C ownership and reopen semantics**

Add this section to `bff/README.md`:

```md
## Agent Ownership (Phase C)

The BFF now owns user-scoped agent visibility through its own ownership table.
Browser-facing `/agents*` routes return only the current user's agents, and any
conversation carrying `agent_name` must also pass agent-visibility checks before
detail, delete, or stream access is allowed.
```

Update `frontend/README.md` so the runtime boundary section says:

```md
- the visible `Agents` UI is now backed by BFF-owned, user-scoped agent routes
- agent conversations remain in the unified recent list, with lightweight agent labeling
- `/workspace/agents/{agent_name}/chats/{conversation_id}` is the canonical agent chat route
- reopening the `Agents` button depends on BFF ownership, not direct Gateway visibility
```

- [ ] **Step 2: Run the focused BFF verification suite**

Run:

```bash
cd bff && .venv/bin/python -m pytest tests/test_main.py tests/repositories/test_agent_ownership_repo.py tests/services/test_agent_ownership_service.py tests/api/test_agent_routes.py tests/api/test_conversation_routes.py tests/api/test_stream_routes.py -q
```

Expected: PASS.

- [ ] **Step 3: Run the focused frontend verification suite**

Run:

```bash
cd frontend && node --test src/components/workspace/agents/agents-disabled.boundary.test.ts src/components/workspace/recent-chat-list.boundary.test.ts src/app/workspace/agents/agent-create-page.boundary.test.ts src/app/workspace/agents/agent-chat-auth-gate.boundary.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run lint and typecheck on touched frontend files**

Run:

```bash
cd frontend && pnpm exec eslint \
  src/core/agents/feature.ts \
  src/components/workspace/workspace-nav-chat-list.tsx \
  src/components/workspace/agents/agents-disabled.boundary.test.ts \
  src/components/workspace/recent-chat-list.tsx \
  src/components/workspace/recent-chat-list.boundary.test.ts \
  src/app/workspace/agents/new/page.tsx \
  src/app/workspace/agents/[agent_name]/chats/[conversation_id]/page.tsx
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
git commit -m "docs: describe phase-c agent ownership boundary"
```

## Self-Review

### Spec coverage

- BFF-owned ownership metadata is covered in Tasks 1 and 2.
- agent CRUD becoming user-scoped is covered in Task 2.
- conversation ownership consistency for `agent_name` is covered in Task 3.
- single recent list plus lightweight agent labeling and UI reopening are covered in Task 4.
- docs and phase-end verification are covered in Task 5.

### Placeholder scan

Run after saving the plan:

```bash
rg -n "T[B]D|T[O]DO|implement[[:space:]]later|fill[[:space:]]in[[:space:]]details|appropriate[[:space:]]error[[:space:]]handling|write[[:space:]]tests[[:space:]]for[[:space:]]the[[:space:]]above|similar[[:space:]]to[[:space:]]Task" docs/superpowers/plans/2026-04-23-phase-c-agents-ownership-and-product-completion.md
```

Expected: no output.

### Type consistency

- Ownership persistence uses a single field name everywhere: `owner_user_id`.
- BFF conversations continue to use `agent_name`, not a separate conversation ownership key.
- Frontend route generation stays on `/workspace/agents/{agent_name}/chats/{conversation_id}`.
- Reopened UI is still guarded by `isAgentsUiEnabled()`, but the flag becomes `true` once ownership support is in place.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-23-phase-c-agents-ownership-and-product-completion.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
