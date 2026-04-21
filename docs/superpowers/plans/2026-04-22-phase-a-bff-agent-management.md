# Phase A BFF Agent Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move browser-facing Agent CRUD management onto a BFF-owned contract so the frontend stops calling `/api/agents*` directly and instead uses authenticated `/api/bff/agents*` routes backed by BFF `/agents*` endpoints.

**Architecture:** Keep the downstream source of truth in Gateway `/api/agents*` for now, but make BFF the only browser-facing contract. BFF will authenticate every Agent CRUD request, normalize downstream errors, and expose a stable CRUD surface. The frontend will add same-origin `/api/bff/agents*` bridges and update `core/agents/api.ts` to use them, while the Agents UI remains hidden behind the feature flag introduced earlier.

**Tech Stack:** FastAPI, httpx, Next.js App Router route handlers, TypeScript, Node `node:test`, pytest, existing BFF auth helpers

---

## File Map

- `bff/app/clients/deerflow.py`
  - Add Agent CRUD methods that call Gateway `/api/agents*`.
- `bff/tests/clients/test_deerflow_client.py`
  - Verify the new DeerFlow client methods target the expected downstream URLs and payloads.
- `bff/app/api/routes/agents.py`
  - New authenticated BFF Agent CRUD routes.
- `bff/app/main.py`
  - Register the new BFF agents router.
- `bff/tests/api/test_agent_routes.py`
  - Verify auth, forwarding, and normalized errors for BFF `/agents*`.
- `frontend/src/app/api/bff/agents/route.ts`
  - Same-origin bridge for list/create.
- `frontend/src/app/api/bff/agents/check/route.ts`
  - Same-origin bridge for name availability checks.
- `frontend/src/app/api/bff/agents/[agent_name]/route.ts`
  - Same-origin bridge for detail/update/delete.
- `frontend/src/app/api/bff/agents/route.boundary.test.ts`
  - Boundary tests for the new frontend BFF Agent bridges.
- `frontend/src/core/agents/api.ts`
  - Switch browser Agent API calls to `/api/bff/agents*`.
- `frontend/src/core/settings-api-boundary.test.ts`
  - Update the Agent API boundary expectations.
- `bff/README.md`
  - Document the new BFF `/agents*` contract.
- `frontend/README.md`
  - Document that browser Agent CRUD now goes through `/api/bff/agents*` while UI remains hidden pending later phases.

### Task 1: Add Gateway-facing Agent CRUD methods to the BFF DeerFlow client

**Files:**
- Modify: `bff/app/clients/deerflow.py`
- Modify: `bff/tests/clients/test_deerflow_client.py`
- Test: `bff/tests/clients/test_deerflow_client.py`

- [ ] **Step 1: Write the failing DeerFlow client tests for Agent CRUD**

Add the following tests to `bff/tests/clients/test_deerflow_client.py`:

```python
def test_list_agents_calls_gateway_agents_root(monkeypatch) -> None:
    async def mock_get(self, url: str, *args, **kwargs):
        request = httpx.Request("GET", url)
        assert url.endswith("/api/agents")
        return httpx.Response(
            200,
            json={"agents": [{"name": "demo-agent", "description": "", "model": None, "tool_groups": None, "soul": ""}]},
            request=request,
        )

    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

    result = asyncio.run(DeerFlowClient().list_agents())

    assert result["agents"][0]["name"] == "demo-agent"
```

```python
def test_check_agent_name_calls_gateway_check_endpoint(monkeypatch) -> None:
    async def mock_get(self, url: str, *args, **kwargs):
        request = httpx.Request("GET", url)
        assert url.endswith("/api/agents/check")
        assert kwargs["params"] == {"name": "demo-agent"}
        return httpx.Response(200, json={"available": True, "name": "demo-agent"}, request=request)

    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

    result = asyncio.run(DeerFlowClient().check_agent_name("demo-agent"))

    assert result["available"] is True
```

```python
def test_create_agent_calls_gateway_agents_root(monkeypatch) -> None:
    payload = {
        "name": "demo-agent",
        "description": "Demo",
        "model": None,
        "tool_groups": None,
        "soul": "Hello",
    }

    async def mock_post(self, url: str, *args, **kwargs):
        request = httpx.Request("POST", url)
        assert url.endswith("/api/agents")
        assert kwargs["json"] == payload
        return httpx.Response(201, json=payload, request=request)

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)

    result = asyncio.run(DeerFlowClient().create_agent(payload))

    assert result["name"] == "demo-agent"
```

Add equivalent tests for:

```python
DeerFlowClient().get_agent("demo-agent")
DeerFlowClient().update_agent("demo-agent", {"description": "Updated"})
DeerFlowClient().delete_agent("demo-agent")
```

with URL expectations:

```text
/api/agents/demo-agent
```

and method expectations:

```text
GET / PUT / DELETE
```

- [ ] **Step 2: Run the DeerFlow client tests to verify they fail**

Run:

```bash
cd bff && PYTHONPATH=. /home/mnze/projects/deer-flow-agentruntime/bff/.venv/bin/python -m pytest tests/clients/test_deerflow_client.py -q
```

Expected: FAIL because `DeerFlowClient` does not yet implement the Agent CRUD methods.

- [ ] **Step 3: Implement the new DeerFlow client methods**

Add these methods to `bff/app/clients/deerflow.py`:

```python
    async def list_agents(self) -> dict:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.get(f"{self.base_url}/api/agents")
            response.raise_for_status()
            return response.json()

    async def check_agent_name(self, name: str) -> dict:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.get(
                f"{self.base_url}/api/agents/check",
                params={"name": name},
            )
            response.raise_for_status()
            return response.json()

    async def get_agent(self, name: str) -> dict:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.get(f"{self.base_url}/api/agents/{name}")
            response.raise_for_status()
            return response.json()

    async def create_agent(self, payload: dict) -> dict:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(f"{self.base_url}/api/agents", json=payload)
            response.raise_for_status()
            return response.json()

    async def update_agent(self, name: str, payload: dict) -> dict:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.put(f"{self.base_url}/api/agents/{name}", json=payload)
            response.raise_for_status()
            return response.json()

    async def delete_agent(self, name: str) -> dict:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.delete(f"{self.base_url}/api/agents/{name}")
            response.raise_for_status()
            return response.json()
```

- [ ] **Step 4: Re-run the DeerFlow client tests to verify they pass**

Run:

```bash
cd bff && PYTHONPATH=. /home/mnze/projects/deer-flow-agentruntime/bff/.venv/bin/python -m pytest tests/clients/test_deerflow_client.py -q
```

Expected: PASS with the new Agent CRUD client methods covered.

- [ ] **Step 5: Commit**

```bash
git add bff/app/clients/deerflow.py bff/tests/clients/test_deerflow_client.py
git commit -m "feat: add bff deerflow agent crud client methods"
```

### Task 2: Add authenticated BFF `/agents*` routes with normalized errors

**Files:**
- Create: `bff/app/api/routes/agents.py`
- Modify: `bff/app/main.py`
- Create: `bff/tests/api/test_agent_routes.py`
- Test: `bff/tests/api/test_agent_routes.py`

- [ ] **Step 1: Write the failing BFF Agent route tests**

Create `bff/tests/api/test_agent_routes.py` with tests like:

```python
from app.clients.deerflow import DeerFlowClient
from app.core.security import create_access_token


def test_agents_routes_require_auth(client) -> None:
    assert client.get("/agents").status_code == 401
    assert client.post("/agents", json={}).status_code == 401
```

```python
def test_list_agents_forwards_to_deerflow(client, monkeypatch) -> None:
    async def fake_list_agents(self) -> dict:
        return {"agents": [{"name": "demo-agent", "description": "", "model": None, "tool_groups": None, "soul": ""}]}

    monkeypatch.setattr(DeerFlowClient, "list_agents", fake_list_agents)

    token = create_access_token("user-123")
    response = client.get("/agents", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert response.json()["agents"][0]["name"] == "demo-agent"
```

```python
def test_create_agent_normalizes_gateway_errors(client, monkeypatch) -> None:
    async def fake_create_agent(self, payload: dict) -> dict:
        raise httpx.HTTPStatusError(
            "conflict",
            request=httpx.Request("POST", "http://testserver/api/agents"),
            response=httpx.Response(409, json={"detail": "Agent already exists"}),
        )

    monkeypatch.setattr(DeerFlowClient, "create_agent", fake_create_agent)

    token = create_access_token("user-123")
    response = client.post(
        "/agents",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "demo-agent", "description": "", "model": None, "tool_groups": None, "soul": ""},
    )

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "agent_exists"
```

Also cover:

- `GET /agents/check`
- `GET /agents/{agent_name}`
- `PUT /agents/{agent_name}`
- `DELETE /agents/{agent_name}`

using the same `create_access_token("user-123")` auth pattern from existing BFF tests.

- [ ] **Step 2: Run the BFF Agent route tests to verify they fail**

Run:

```bash
cd bff && PYTHONPATH=. /home/mnze/projects/deer-flow-agentruntime/bff/.venv/bin/python -m pytest tests/api/test_agent_routes.py -q
```

Expected: FAIL because the BFF `/agents*` routes do not exist yet.

- [ ] **Step 3: Implement the authenticated BFF `/agents*` routes**

Create `bff/app/api/routes/agents.py` with route handlers like:

```python
from fastapi import APIRouter, Depends, status
import httpx

from app.api.deps import get_current_user_id
from app.api.errors import error_response
from app.clients.deerflow import DeerFlowClient

router = APIRouter(tags=["agents"])


@router.get("/agents")
async def list_agents(user_id: str = Depends(get_current_user_id)) -> dict:
    del user_id
    try:
        return await DeerFlowClient().list_agents()
    except httpx.HTTPStatusError as exc:
        raise _normalize_agents_error(exc) from exc
```

Add matching handlers for:

- `GET /agents/check`
- `GET /agents/{agent_name}`
- `POST /agents`
- `PUT /agents/{agent_name}`
- `DELETE /agents/{agent_name}`

Use a shared normalization helper in the same file:

```python
def _normalize_agents_error(exc: httpx.HTTPStatusError):
    status_code = exc.response.status_code
    payload = exc.response.json() if exc.response.content else {}
    detail = payload.get("detail") if isinstance(payload, dict) else None

    if status_code == 404:
        raise error_response(status.HTTP_404_NOT_FOUND, "agent_not_found", str(detail or "Agent not found"))
    if status_code == 409:
        raise error_response(status.HTTP_409_CONFLICT, "agent_exists", str(detail or "Agent already exists"))
    if status_code == 422:
        raise error_response(status.HTTP_422_UNPROCESSABLE_ENTITY, "invalid_agent_input", str(detail or "Invalid agent input"))
    if status_code in {502, 503, 504}:
        raise error_response(status.HTTP_502_BAD_GATEWAY, "agents_backend_unreachable", "Could not reach the DeerFlow backend")
    raise error_response(status.HTTP_502_BAD_GATEWAY, "agents_unavailable", str(detail or "Failed to load agents"))
```

Register the router in `bff/app/main.py`:

```python
from app.api.routes import agents, auth, conversation_resources, conversations, memory, models, users

app.include_router(agents.router)
```

- [ ] **Step 4: Re-run the BFF Agent route tests to verify they pass**

Run:

```bash
cd bff && PYTHONPATH=. /home/mnze/projects/deer-flow-agentruntime/bff/.venv/bin/python -m pytest tests/api/test_agent_routes.py -q
```

Expected: PASS with authenticated BFF `/agents*` routes and normalized downstream errors.

- [ ] **Step 5: Commit**

```bash
git add bff/app/api/routes/agents.py bff/app/main.py bff/tests/api/test_agent_routes.py
git commit -m "feat: add bff agent crud routes"
```

### Task 3: Add same-origin frontend `/api/bff/agents*` bridge routes

**Files:**
- Create: `frontend/src/app/api/bff/agents/route.ts`
- Create: `frontend/src/app/api/bff/agents/check/route.ts`
- Create: `frontend/src/app/api/bff/agents/[agent_name]/route.ts`
- Create: `frontend/src/app/api/bff/agents/route.boundary.test.ts`
- Test: `frontend/src/app/api/bff/agents/route.boundary.test.ts`

- [ ] **Step 1: Write the failing frontend BFF Agent bridge boundary test**

Create `frontend/src/app/api/bff/agents/route.boundary.test.ts`:

```typescript
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("bff agents routes authenticate and proxy to the internal BFF service", async () => {
  const rootSource = await readFile(new URL("./route.ts", import.meta.url), "utf8");
  const checkSource = await readFile(new URL("./check/route.ts", import.meta.url), "utf8");
  const detailSource = await readFile(new URL("./[agent_name]/route.ts", import.meta.url), "utf8");

  for (const source of [rootSource, checkSource, detailSource]) {
    assert.ok(source.includes("requireBffAuth"));
    assert.ok(source.includes("buildBearerHeaders"));
    assert.ok(source.includes("getInternalBffBaseURL"));
  }

  assert.ok(rootSource.includes('fetch(`${getInternalBffBaseURL()}/agents`'));
  assert.ok(checkSource.includes('fetch(`${getInternalBffBaseURL()}/agents/check?${request.nextUrl.searchParams.toString()}`'));
  assert.ok(detailSource.includes('fetch(`${getInternalBffBaseURL()}/agents/${agentName}`'));
});
```

- [ ] **Step 2: Run the frontend bridge boundary test to verify it fails**

Run:

```bash
cd frontend && node --test src/app/api/bff/agents/route.boundary.test.ts
```

Expected: FAIL because the BFF Agent bridge files do not exist yet.

- [ ] **Step 3: Implement the frontend `/api/bff/agents*` bridge routes**

Create `frontend/src/app/api/bff/agents/route.ts`:

```ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { buildBearerHeaders, requireBffAuth } from "@/server/bff/auth";
import { getInternalBffBaseURL } from "@/server/bff/internal";

async function proxy(request: NextRequest, url: string) {
  const auth = await requireBffAuth(request);
  if ("error" in auth) {
    return auth.error;
  }

  const hasBody = !["GET", "HEAD"].includes(request.method);
  const response = await fetch(url, {
    method: request.method,
    headers: buildBearerHeaders(
      auth.bearerToken,
      hasBody ? request.headers.get("content-type") ?? undefined : undefined,
    ),
    body: hasBody ? await request.text() : undefined,
  });

  return new NextResponse(await response.text(), {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json",
    },
  });
}

export async function GET(request: NextRequest) {
  return proxy(request, `${getInternalBffBaseURL()}/agents`);
}

export async function POST(request: NextRequest) {
  return proxy(request, `${getInternalBffBaseURL()}/agents`);
}
```

Create matching `check/route.ts` and `[agent_name]/route.ts` files that proxy to:

```text
${getInternalBffBaseURL()}/agents/check?...query...
${getInternalBffBaseURL()}/agents/${agentName}
```

with methods:

```text
GET / PUT / DELETE
```

- [ ] **Step 4: Re-run the frontend bridge boundary test to verify it passes**

Run:

```bash
cd frontend && node --test src/app/api/bff/agents/route.boundary.test.ts
```

Expected: PASS with authenticated same-origin `/api/bff/agents*` bridges.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/api/bff/agents/route.ts frontend/src/app/api/bff/agents/check/route.ts frontend/src/app/api/bff/agents/[agent_name]/route.ts frontend/src/app/api/bff/agents/route.boundary.test.ts
git commit -m "feat: add frontend bff agent bridges"
```

### Task 4: Switch the frontend browser Agent API layer to `/api/bff/agents*`

**Files:**
- Modify: `frontend/src/core/agents/api.ts`
- Modify: `frontend/src/core/settings-api-boundary.test.ts`
- Test: `frontend/src/core/settings-api-boundary.test.ts`

- [ ] **Step 1: Write the failing Agent API boundary expectation**

Update the Agent section in `frontend/src/core/settings-api-boundary.test.ts` to:

```typescript
void test("agents API uses same-origin BFF agent routes", async () => {
  const source = await readSource("./agents/api.ts");

  assert.ok(
    source.includes('fetch("/api/bff/agents"'),
    "expected agents API to use the same-origin /api/bff/agents route",
  );
  assert.ok(
    !source.includes('fetch("/api/agents"'),
    "expected agents API to stop using the old gateway-facing /api/agents route",
  );
  assert.ok(
    !source.includes("getBackendBaseURL"),
    "expected agents API to stop reading the raw backend base URL",
  );
});
```

- [ ] **Step 2: Run the boundary test to verify it fails**

Run:

```bash
cd frontend && node --test src/core/settings-api-boundary.test.ts
```

Expected: FAIL because the current Agent API still targets `/api/agents*`.

- [ ] **Step 3: Switch `core/agents/api.ts` to BFF routes**

Update `frontend/src/core/agents/api.ts` so the fetch targets become:

```ts
fetch("/api/bff/agents")
fetch(`/api/bff/agents/${name}`)
fetch(`/api/bff/agents/check?name=${encodeURIComponent(name)}`)
```

Keep the existing `AgentNameCheckError` behavior, but update the downstream-unreachable fallback message to describe the BFF path when appropriate:

```ts
throw new AgentNameCheckError(
  "Could not reach the DeerFlow backend.",
  "backend_unreachable",
);
```

No additional browser API shape changes are needed in this phase.

- [ ] **Step 4: Re-run the boundary test to verify it passes**

Run:

```bash
cd frontend && node --test src/core/settings-api-boundary.test.ts
```

Expected: PASS with `core/agents/api.ts` using `/api/bff/agents*`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/core/agents/api.ts frontend/src/core/settings-api-boundary.test.ts
git commit -m "refactor: route frontend agents api through bff"
```

### Task 5: Update docs and run focused end-of-phase verification

**Files:**
- Modify: `bff/README.md`
- Modify: `frontend/README.md`
- Test: `bff/tests/api/test_agent_routes.py`
- Test: `bff/tests/clients/test_deerflow_client.py`
- Test: `frontend/src/app/api/bff/agents/route.boundary.test.ts`
- Test: `frontend/src/core/settings-api-boundary.test.ts`

- [ ] **Step 1: Update docs for the new Phase A boundary**

Add a BFF README section like:

```md
## Agent Management (Phase A)

The BFF now owns browser-facing Agent CRUD management through `/agents*`.
These routes authenticate the current user and proxy to DeerFlow Gateway agent management APIs while normalizing downstream errors. In this phase the browser no longer calls `/api/agents*` directly, but agent data semantics may still remain global until later ownership phases are complete.
```

Update `frontend/README.md` so the runtime boundary section says:

```md
- browser Agent CRUD now goes through `/api/bff/agents*`
- the hidden Agents UI remains behind a feature flag until later phases complete Agent Chat migration and user isolation
- `/api/agents*` is no longer a browser-facing contract for the frontend `core/agents` layer
```

- [ ] **Step 2: Run the focused BFF and frontend tests**

Run:

```bash
cd bff && PYTHONPATH=. /home/mnze/projects/deer-flow-agentruntime/bff/.venv/bin/python -m pytest tests/clients/test_deerflow_client.py tests/api/test_agent_routes.py -q
```

Expected: PASS.

Run:

```bash
cd frontend && node --test src/app/api/bff/agents/route.boundary.test.ts src/core/settings-api-boundary.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run focused static validation for the changed frontend files**

Run:

```bash
cd frontend && pnpm exec eslint \
  src/app/api/bff/agents/route.ts \
  src/app/api/bff/agents/check/route.ts \
  src/app/api/bff/agents/[agent_name]/route.ts \
  src/app/api/bff/agents/route.boundary.test.ts \
  src/core/agents/api.ts \
  src/core/settings-api-boundary.test.ts
```

Expected: PASS.

Run:

```bash
cd frontend && pnpm typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add bff/README.md frontend/README.md
git commit -m "docs: describe phase-a bff agents boundary"
```

## Self-Review

### Spec coverage

- BFF-owned `/agents*` CRUD contract is implemented in Tasks 1 and 2.
- Frontend `/api/bff/agents*` bridges are implemented in Task 3.
- Browser Agent API layer migration is implemented in Task 4.
- Docs and phase-end verification are covered in Task 5.
- The hidden UI remains untouched by this plan, matching the agreed boundary.

### Placeholder scan

Run after saving the plan:

```bash
rg -n "T[B]D|T[O]DO|implement[[:space:]]later|fill[[:space:]]in[[:space:]]details|appropriate[[:space:]]error[[:space:]]handling|write[[:space:]]tests[[:space:]]for[[:space:]]the[[:space:]]above|similar[[:space:]]to[[:space:]]Task" docs/superpowers/plans/2026-04-22-phase-a-bff-agent-management.md
```

Expected: no output.

### Type consistency

- Phase A introduces only `/agents*` CRUD routes; it does not add any conversation-specific routes.
- The browser Agent API stays on the existing `Agent`, `CreateAgentRequest`, and `UpdateAgentRequest` types.
- `AgentNameCheckError` remains the browser-level name-check error shape.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-22-phase-a-bff-agent-management.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
