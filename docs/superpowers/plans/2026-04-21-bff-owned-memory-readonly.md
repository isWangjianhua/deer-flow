# BFF-Owned Readonly Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move browser Memory reads onto a true BFF-owned `GET /memory` contract, delete the frontend-owned `/api/memory*` bridge, and reduce `Settings > Memory` to a mem0-compatible readonly view with a clear unauthenticated state.

**Architecture:** Keep Gateway as the runtime memory owner, but make BFF the only browser-facing Memory contract. The frontend browser client will call `/api/bff/memory`; the Next.js bridge will forward the authenticated bearer token to the internal BFF `/memory`; the BFF will resolve `user_id` with `get_current_user_id` and call `DeerFlowClient.get_memory(user_id=...)`, which already maps the current mem0 user to `X-User-Id` for Gateway.

**Tech Stack:** FastAPI, Next.js App Router, TypeScript, React, TanStack Query, Node `node:test`, pytest, mem0 user-scoped Gateway memory routes

---

## File Map

- `bff/app/api/routes/memory.py`
  - New readonly BFF Memory route.
- `bff/app/main.py`
  - Registers the new BFF Memory route.
- `bff/tests/api/test_memory_routes.py`
  - Verifies auth requirement, `user_id` forwarding, and error behavior for BFF Memory.
- `frontend/src/app/api/bff/memory/route.ts`
  - New same-origin Next.js bridge from browser to internal BFF `/memory`.
- `frontend/src/app/api/bff/memory/route.boundary.test.ts`
  - Verifies the frontend BFF Memory bridge uses auth and the internal BFF base URL.
- `frontend/src/app/api/memory/route.ts`
  - Deleted; old frontend-owned Gateway Memory bridge.
- `frontend/src/app/api/memory/[...path]/route.ts`
  - Deleted; old nested Memory bridge.
- `frontend/src/app/api/memory/_proxy.ts`
  - Deleted; old bridge helper that called BFF `/me` and Gateway directly.
- `frontend/src/core/memory/api.ts`
  - Reduced to readonly `loadMemory()` against `/api/bff/memory`.
- `frontend/src/core/memory/hooks.ts`
  - Reduced to readonly `useMemory()`.
- `frontend/src/core/memory/index.ts`
  - Re-exports only the readonly Memory surface.
- `frontend/src/components/workspace/settings/memory-settings-page.tsx`
  - Converted to readonly rendering and unauthenticated empty state.
- `frontend/src/core/settings-api-boundary.test.ts`
  - Verifies frontend Memory API now targets `/api/bff/memory`.
- `frontend/src/components/workspace/settings/memory-settings-page.boundary.test.ts`
  - Verifies the page no longer imports write hooks or write actions.
- `frontend/README.md`
  - Documents BFF-owned readonly Memory and mem0 user scoping.
- `bff/README.md`
  - Documents the new readonly `/memory` contract.

### Task 1: Add the readonly BFF Memory route

**Files:**
- Create: `bff/app/api/routes/memory.py`
- Modify: `bff/app/main.py`
- Create: `bff/tests/api/test_memory_routes.py`
- Test: `bff/tests/api/test_memory_routes.py`

- [ ] **Step 1: Write the failing BFF route tests**

Create `bff/tests/api/test_memory_routes.py` with these tests:

```python
from app.api import deps as deps_module
from app.clients.deerflow import DeerFlowClient


def test_memory_requires_auth(client) -> None:
    response = client.get("/memory")

    assert response.status_code == 403


def test_memory_forwards_authenticated_user_id(client, monkeypatch) -> None:
    calls: list[str] = []

    async def fake_get_memory(self, *, user_id: str) -> dict:
        calls.append(user_id)
        return {
            "version": "1.0",
            "lastUpdated": "2026-04-21T12:00:00Z",
            "user": {
                "workContext": {"summary": "work", "updatedAt": "2026-04-21T12:00:00Z"},
                "personalContext": {"summary": "personal", "updatedAt": "2026-04-21T12:00:00Z"},
                "topOfMind": {"summary": "mind", "updatedAt": "2026-04-21T12:00:00Z"},
            },
            "history": {
                "recentMonths": {"summary": "recent", "updatedAt": "2026-04-21T12:00:00Z"},
                "earlierContext": {"summary": "earlier", "updatedAt": "2026-04-21T12:00:00Z"},
                "longTermBackground": {"summary": "background", "updatedAt": "2026-04-21T12:00:00Z"},
            },
            "facts": [],
        }

    monkeypatch.setattr(deps_module, "get_current_user_id", lambda: "user-123", raising=False)
    monkeypatch.setattr(DeerFlowClient, "get_memory", fake_get_memory)

    response = client.get("/memory", headers={"Authorization": "Bearer test-token"})

    assert response.status_code == 200
    assert response.json()["version"] == "1.0"
    assert calls == ["user-123"]
```

Add a downstream-error test in the same file:

```python
def test_memory_normalizes_deerflow_errors(client, monkeypatch) -> None:
    async def fake_get_memory(self, *, user_id: str) -> dict:
        raise RuntimeError("gateway down")

    monkeypatch.setattr(deps_module, "get_current_user_id", lambda: "user-123", raising=False)
    monkeypatch.setattr(DeerFlowClient, "get_memory", fake_get_memory)

    response = client.get("/memory", headers={"Authorization": "Bearer test-token"})

    assert response.status_code == 502
    assert response.json()["code"] == "memory_unavailable"
```

- [ ] **Step 2: Run the BFF route tests to verify they fail**

Run:

```bash
cd bff && uv run pytest tests/api/test_memory_routes.py -q
```

Expected: FAIL because `/memory` is not registered yet.

- [ ] **Step 3: Implement the readonly BFF route and register it**

Create `bff/app/api/routes/memory.py`:

```python
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_id, get_db_session
from app.api.errors import error_response
from app.clients.deerflow import DeerFlowClient

router = APIRouter(tags=["memory"])


@router.get("/memory")
async def get_memory(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db_session),
) -> dict:
    del db
    try:
        return await DeerFlowClient().get_memory(user_id=user_id)
    except Exception as exc:
        raise error_response(
            status.HTTP_502_BAD_GATEWAY,
            "memory_unavailable",
            "Failed to load memory",
        ) from exc
```

Update `bff/app/main.py` to register the route:

```python
from app.api.routes import auth, conversation_resources, conversations, memory, models, users

app.include_router(memory.router)
```

- [ ] **Step 4: Re-run the BFF route tests to verify they pass**

Run:

```bash
cd bff && uv run pytest tests/api/test_memory_routes.py -q
```

Expected: PASS with the readonly `/memory` route registered and authenticated.

- [ ] **Step 5: Commit**

```bash
git add bff/app/api/routes/memory.py bff/app/main.py bff/tests/api/test_memory_routes.py
git commit -m "feat: add readonly bff memory route"
```

### Task 2: Replace the frontend-owned `/api/memory*` bridge with `/api/bff/memory`

**Files:**
- Create: `frontend/src/app/api/bff/memory/route.ts`
- Create: `frontend/src/app/api/bff/memory/route.boundary.test.ts`
- Delete: `frontend/src/app/api/memory/route.ts`
- Delete: `frontend/src/app/api/memory/[...path]/route.ts`
- Delete: `frontend/src/app/api/memory/_proxy.ts`
- Test: `frontend/src/app/api/bff/memory/route.boundary.test.ts`

- [ ] **Step 1: Write the failing frontend BFF bridge test**

Create `frontend/src/app/api/bff/memory/route.boundary.test.ts`:

```typescript
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("bff memory route authenticates and proxies to the internal BFF memory endpoint", async () => {
  const source = await readFile(new URL("./route.ts", import.meta.url), "utf8");

  assert.ok(source.includes("requireBffAuth"));
  assert.ok(source.includes('fetch(`${getInternalBffBaseURL()}/memory`'));
  assert.ok(source.includes("buildBearerHeaders"));
});
```

- [ ] **Step 2: Run the frontend bridge test to verify it fails**

Run:

```bash
cd frontend && node --test src/app/api/bff/memory/route.boundary.test.ts
```

Expected: FAIL because the route file does not exist yet.

- [ ] **Step 3: Implement the BFF bridge and delete the old frontend-owned bridge**

Create `frontend/src/app/api/bff/memory/route.ts`:

```ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requireBffAuth, buildBearerHeaders } from "@/server/bff/auth";
import { getInternalBffBaseURL } from "@/server/bff/internal";

export async function GET(request: NextRequest) {
  const auth = await requireBffAuth(request);
  if ("error" in auth) {
    return auth.error;
  }

  const response = await fetch(`${getInternalBffBaseURL()}/memory`, {
    headers: buildBearerHeaders(auth.bearerToken),
  });

  return new NextResponse(await response.text(), {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json",
    },
  });
}
```

Delete the old frontend Memory bridge files in the same change:

```text
frontend/src/app/api/memory/route.ts
frontend/src/app/api/memory/[...path]/route.ts
frontend/src/app/api/memory/_proxy.ts
```

- [ ] **Step 4: Re-run the frontend bridge test to verify it passes**

Run:

```bash
cd frontend && node --test src/app/api/bff/memory/route.boundary.test.ts
```

Expected: PASS with the new `/api/bff/memory` bridge in place.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/api/bff/memory/route.ts frontend/src/app/api/bff/memory/route.boundary.test.ts frontend/src/app/api/memory/route.ts frontend/src/app/api/memory/[...path]/route.ts frontend/src/app/api/memory/_proxy.ts
git commit -m "refactor: route browser memory reads through bff"
```

### Task 3: Reduce the frontend Memory client to readonly `/api/bff/memory`

**Files:**
- Modify: `frontend/src/core/settings-api-boundary.test.ts`
- Modify: `frontend/src/core/memory/api.ts`
- Modify: `frontend/src/core/memory/hooks.ts`
- Modify: `frontend/src/core/memory/index.ts`
- Test: `frontend/src/core/settings-api-boundary.test.ts`

- [ ] **Step 1: Write the failing readonly Memory client boundary test**

Update `frontend/src/core/settings-api-boundary.test.ts` so the Memory section becomes:

```typescript
void test("memory API uses the BFF-owned memory route", async () => {
  const source = await readSource("./memory/api.ts");

  assert.ok(
    source.includes('fetch("/api/bff/memory"'),
    "expected memory API to use the BFF-owned /api/bff/memory route",
  );
  assert.ok(
    !source.includes("/api/memory"),
    "expected memory API to stop targeting the old frontend-owned /api/memory route",
  );
  assert.ok(
    !source.includes("clearMemory"),
    "expected the readonly memory client to drop clearMemory",
  );
});
```

- [ ] **Step 2: Run the Memory client boundary test to verify it fails**

Run:

```bash
cd frontend && node --test src/core/settings-api-boundary.test.ts
```

Expected: FAIL because the current client still targets `/api/memory` and still exports write helpers.

- [ ] **Step 3: Reduce the Memory client surface to readonly**

Replace `frontend/src/core/memory/api.ts` with a readonly-only version:

```ts
import type { UserMemory } from "./types";

async function readMemoryResponse(
  response: Response,
  fallbackMessage: string,
): Promise<UserMemory> {
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      detail?: string;
      message?: string;
    };
    throw new Error(payload.detail ?? payload.message ?? fallbackMessage);
  }

  return response.json() as Promise<UserMemory>;
}

export async function loadMemory(): Promise<UserMemory> {
  const response = await fetch("/api/bff/memory");
  return readMemoryResponse(response, "Failed to fetch memory");
}
```

Reduce `frontend/src/core/memory/hooks.ts` to only:

```ts
import { useQuery } from "@tanstack/react-query";
import { loadMemory } from "./api";

export function useMemory() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["memory"],
    queryFn: () => loadMemory(),
  });
  return { memory: data ?? null, isLoading, error };
}
```

Reduce `frontend/src/core/memory/index.ts` to:

```ts
export * from "./api";
export * from "./hooks";
export * from "./types";
```

- [ ] **Step 4: Re-run the Memory client boundary test to verify it passes**

Run:

```bash
cd frontend && node --test src/core/settings-api-boundary.test.ts
```

Expected: PASS with a readonly-only Memory client targeting `/api/bff/memory`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/core/settings-api-boundary.test.ts frontend/src/core/memory/api.ts frontend/src/core/memory/hooks.ts frontend/src/core/memory/index.ts
git commit -m "refactor: make frontend memory client readonly"
```

### Task 4: Convert `Settings > Memory` to readonly viewing with unauthenticated state

**Files:**
- Modify: `frontend/src/components/workspace/settings/memory-settings-page.boundary.test.ts`
- Modify: `frontend/src/components/workspace/settings/memory-settings-page.tsx`
- Test: `frontend/src/components/workspace/settings/memory-settings-page.boundary.test.ts`

- [ ] **Step 1: Write the failing readonly page boundary test**

Update `frontend/src/components/workspace/settings/memory-settings-page.boundary.test.ts` to assert the page only depends on readonly hooks and no write UI:

```typescript
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("memory settings page is readonly and handles unauthenticated state", async () => {
  const source = await readFile(new URL("./memory-settings-page.tsx", import.meta.url), "utf8");

  assert.ok(source.includes("useMemory"));
  assert.ok(!source.includes("useCreateMemoryFact"));
  assert.ok(!source.includes("useUpdateMemoryFact"));
  assert.ok(!source.includes("useDeleteMemoryFact"));
  assert.ok(!source.includes("useImportMemory"));
  assert.ok(!source.includes("useClearMemory"));
  assert.ok(!source.includes("PlusIcon"));
  assert.ok(!source.includes("Trash2Icon"));
  assert.ok(source.includes("unauthenticated"));
});
```

- [ ] **Step 2: Run the page boundary test to verify it fails**

Run:

```bash
cd frontend && node --test src/components/workspace/settings/memory-settings-page.boundary.test.ts
```

Expected: FAIL because the page still imports write hooks and write-action icons.

- [ ] **Step 3: Strip the page down to readonly rendering and add unauthenticated UI**

Edit `frontend/src/components/workspace/settings/memory-settings-page.tsx` to remove the write actions and classify auth failures.

Keep the readonly helpers already in the file:

```text
- buildMemorySectionGroups()
- summariesToMarkdown()
- isMemorySummaryEmpty()
- search/filter over facts and summaries
- formatTimeAgo()
- pathOfThread()
```

Replace the hook and state setup with a readonly shape like:

```tsx
const { memory, isLoading, error } = useMemory();
const [query, setQuery] = useState("");
const [filter, setFilter] = useState<MemoryViewFilter>("all");
const deferredQuery = useDeferredValue(query);
const normalizedQuery = deferredQuery.trim().toLowerCase();
const isUnauthenticated =
  error instanceof Error &&
  /sign in required|authenticated bff user required|invalid token/i.test(error.message);
```

Render a readonly unauthenticated state near the top-level content branch:

```tsx
if (isUnauthenticated) {
  return (
    <SettingsSection
      title={t.settings.sections.memory}
      description={t.settings.memory.description}
    >
      <div className="text-muted-foreground rounded-lg border border-dashed p-6 text-sm">
        {t.auth.signInRequired ?? "请先登录后查看记忆。"}
      </div>
    </SettingsSection>
  );
}
```

Delete these imports and their related JSX/state from the file:

```text
DownloadIcon
PenLineIcon
PlusIcon
Trash2Icon
UploadIcon
Dialog*
Textarea
exportMemory
useClearMemory
useCreateMemoryFact
useDeleteMemoryFact
useImportMemory
useUpdateMemoryFact
MemoryFactInput
MemoryFactPatchInput
PendingImport
FactFormState
DEFAULT_FACT_FORM_STATE
```

- [ ] **Step 4: Re-run the page boundary test to verify it passes**

Run:

```bash
cd frontend && node --test src/components/workspace/settings/memory-settings-page.boundary.test.ts
```

Expected: PASS with a readonly page and explicit unauthenticated state.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/workspace/settings/memory-settings-page.boundary.test.ts frontend/src/components/workspace/settings/memory-settings-page.tsx
git commit -m "refactor: make memory settings page readonly"
```

### Task 5: Update docs and run focused verification

**Files:**
- Modify: `frontend/README.md`
- Modify: `bff/README.md`
- Test: `bff/tests/api/test_memory_routes.py`
- Test: `frontend/src/app/api/bff/memory/route.boundary.test.ts`
- Test: `frontend/src/core/settings-api-boundary.test.ts`
- Test: `frontend/src/components/workspace/settings/memory-settings-page.boundary.test.ts`

- [ ] **Step 1: Update BFF and frontend docs for readonly BFF-owned Memory**

Add a short BFF contract note to `bff/README.md`:

```md
## Readonly Memory

The BFF now exposes `GET /memory` as the browser-facing readonly Memory contract.
It authenticates the current user, resolves the current `user_id`, and forwards that user scope to DeerFlow Gateway memory routes. In `memory.provider=mem0`, this ensures Memory remains user-scoped through `X-User-Id`.
```

Update `frontend/README.md` so the Memory bullets explicitly say:

```md
- browser Memory reads now go through `/api/bff/memory`
- the old frontend-owned `/api/memory*` Gateway bridge has been removed
- `Settings > Memory` is readonly in this slice and shows a sign-in prompt when unauthenticated
- in `memory.provider=mem0`, BFF resolves the current user and preserves user-scoped Memory reads
```

- [ ] **Step 2: Run the focused BFF and frontend tests**

Run:

```bash
cd bff && uv run pytest tests/api/test_memory_routes.py -q
```

Expected: PASS.

Run:

```bash
cd frontend && node --test \
  src/app/api/bff/memory/route.boundary.test.ts \
  src/core/settings-api-boundary.test.ts \
  src/components/workspace/settings/memory-settings-page.boundary.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run focused static validation on the changed frontend and BFF files**

Run:

```bash
cd frontend && pnpm exec eslint \
  src/app/api/bff/memory/route.ts \
  src/core/memory/api.ts \
  src/core/memory/hooks.ts \
  src/core/memory/index.ts \
  src/components/workspace/settings/memory-settings-page.tsx
```

Expected: PASS.

Run:

```bash
cd frontend && pnpm typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/README.md bff/README.md
git commit -m "docs: document readonly bff memory path"
```

## Self-Review

### Spec coverage

- BFF-owned readonly `GET /memory` is implemented in Task 1.
- Frontend browser path migration to `/api/bff/memory` and old bridge removal are implemented in Task 2.
- Readonly frontend Memory client is implemented in Task 3.
- Readonly UI and unauthenticated state are implemented in Task 4.
- Docs and final verification are covered in Task 5.

### Placeholder scan

Run after saving the plan:

```bash
rg -n "T[B]D|T[O]DO|implement[[:space:]]later|fill[[:space:]]in[[:space:]]details|appropriate[[:space:]]error[[:space:]]handling|write[[:space:]]tests[[:space:]]for[[:space:]]the[[:space:]]above|similar[[:space:]]to[[:space:]]Task" docs/superpowers/plans/2026-04-21-bff-owned-memory-readonly.md
```

Expected: no output.

### Type consistency

- `GET /memory` is the only BFF route added in this plan.
- `loadMemory()` remains the sole browser Memory client function.
- `useMemory()` remains the sole browser Memory hook.
- `MemorySettingsPage` is reduced to readonly rendering and must not import write hooks.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-21-bff-owned-memory-readonly.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
