# Restore Agents And Memory UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the hidden frontend Agents and Memory surfaces to a working, `main`-aligned state while keeping Memory same-origin and compatible with the current `memory.provider=mem0` backend configuration.

**Architecture:** Reuse `main` for the visible UI and route/page composition, but keep current ownership boundaries. Agents continue to use the existing same-origin `/api/agents` Gateway bridge and legacy runtime-thread chat path. Memory is restored through a mem0-aware Next.js server bridge that resolves the authenticated BFF user, forwards `X-User-Id` to Gateway, and lets the browser stay on `/api/memory*`.

**Tech Stack:** Next.js App Router, React, TypeScript, TanStack Query, Node `node:test` boundary tests, same-origin Gateway bridges, Better Auth / BFF auth helpers

---

## File Map

- `frontend/src/components/workspace/workspace-nav-chat-list.tsx`
  - Restores the `Agents` sidebar entry.
- `frontend/src/app/workspace/agents/page.tsx`
  - Routes `/workspace/agents` back to `AgentGallery`.
- `frontend/src/app/workspace/agents/new/page.tsx`
  - Restores the `main` create-agent bootstrap flow.
- `frontend/src/app/workspace/agents/[agent_name]/chats/[thread_id]/page.tsx`
  - Restores the `main` agent chat shell with login guard and thread streaming.
- `frontend/src/app/api/memory/_proxy.ts`
  - New focused server helper that resolves the current authenticated user and proxies mem0-scoped Gateway memory requests with `X-User-Id`.
- `frontend/src/app/api/memory/route.ts`
  - Owns `/api/memory` root GET and DELETE.
- `frontend/src/app/api/memory/[...path]/route.ts`
  - Owns nested `/api/memory/*` GET/POST/PATCH/DELETE.
- `frontend/src/core/memory/types.ts`
  - Restores browser-side memory types.
- `frontend/src/core/memory/api.ts`
  - Restores browser-side same-origin Memory API helpers.
- `frontend/src/core/memory/hooks.ts`
  - Restores TanStack Query hooks for Memory.
- `frontend/src/core/memory/index.ts`
  - Re-exports the Memory client surface.
- `frontend/src/components/workspace/settings/memory-settings-page.tsx`
  - Restores the Memory UI from `main`, keeping the same interaction model.
- `frontend/src/components/workspace/settings/settings-dialog.tsx`
  - Reintroduces the Memory section and page entry point.
- `frontend/src/components/workspace/agents/agents-disabled.boundary.test.ts`
  - Flips from “disabled” assertions to “enabled” assertions for nav and routes.
- `frontend/src/app/workspace/agents/agent-chat-auth-gate.boundary.test.ts`
  - Flips from disabled-state assertions to auth-aware agent chat assertions.
- `frontend/src/app/workspace/agents/agent-create-page.boundary.test.ts`
  - New boundary test for the restored create-agent flow.
- `frontend/src/components/workspace/settings/settings-dialog.boundary.test.ts`
  - Flips back to a Memory-aware settings dialog boundary.
- `frontend/src/components/workspace/settings/memory-settings-page.boundary.test.ts`
  - New boundary test for the restored Memory page.
- `frontend/src/core/settings-api-boundary.test.ts`
  - Restores same-origin Memory API expectations.
- `frontend/src/app/api/memory/route.boundary.test.ts`
  - New boundary test for the mem0-aware Memory bridge.
- `tests/root/makefile.boundary.test.mjs`
  - Restores README expectations for the browser Memory surface and `/memory` command docs.
- `README.md`
  - Re-documents `Settings > Memory` and the `/memory` channel command.

### Task 1: Re-enable the workspace Agents entry and gallery route

**Files:**
- Modify: `frontend/src/components/workspace/agents/agents-disabled.boundary.test.ts`
- Modify: `frontend/src/components/workspace/workspace-nav-chat-list.tsx`
- Modify: `frontend/src/app/workspace/agents/page.tsx`
- Test: `frontend/src/components/workspace/agents/agents-disabled.boundary.test.ts`

- [ ] **Step 1: Write the failing boundary expectations for the enabled Agents shell**

Replace the current disabled assertions in `frontend/src/components/workspace/agents/agents-disabled.boundary.test.ts` with source checks like:

```typescript
void test("workspace navigation exposes the agents entry", async () => {
  const source = await readFile(
    new URL("../workspace-nav-chat-list.tsx", import.meta.url),
    "utf8",
  );

  assert.ok(
    source.includes('href="/workspace/agents"'),
    "expected workspace navigation to expose the agents area again",
  );
});

void test("agent gallery route renders the shared gallery component", async () => {
  const galleryPage = await readFile(
    new URL("../../../app/workspace/agents/page.tsx", import.meta.url),
    "utf8",
  );

  assert.ok(
    galleryPage.includes("AgentGallery"),
    "expected the agents page to render AgentGallery",
  );
  assert.ok(
    !galleryPage.includes("AgentsDisabledState"),
    "expected the agents page to stop rendering the disabled state",
  );
});
```

- [ ] **Step 2: Run the boundary test to verify it fails**

Run:

```bash
cd frontend && node --test src/components/workspace/agents/agents-disabled.boundary.test.ts
```

Expected: FAIL because the sidebar still hides `href="/workspace/agents"` and the route still renders `AgentsDisabledState`.

- [ ] **Step 3: Restore the sidebar entry and gallery route with the smallest change**

Update `frontend/src/components/workspace/workspace-nav-chat-list.tsx` to match the `main` navigation shape:

```tsx
import { BotIcon, MessagesSquare } from "lucide-react";

<SidebarMenuItem>
  <SidebarMenuButton
    isActive={pathname.startsWith("/workspace/agents")}
    asChild
  >
    <Link className="text-muted-foreground" href="/workspace/agents">
      <BotIcon />
      <span>{t.sidebar.agents}</span>
    </Link>
  </SidebarMenuButton>
</SidebarMenuItem>
```

Update `frontend/src/app/workspace/agents/page.tsx` to restore the route wiring:

```tsx
import { AgentGallery } from "@/components/workspace/agents/agent-gallery";

export default function AgentsPage() {
  return <AgentGallery />;
}
```

- [ ] **Step 4: Re-run the boundary test to verify it passes**

Run:

```bash
cd frontend && node --test src/components/workspace/agents/agents-disabled.boundary.test.ts
```

Expected: PASS with the restored nav link and `AgentGallery` route.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/workspace/agents/agents-disabled.boundary.test.ts frontend/src/components/workspace/workspace-nav-chat-list.tsx frontend/src/app/workspace/agents/page.tsx
git commit -m "feat: restore agents sidebar and gallery"
```

### Task 2: Restore the mem0-aware same-origin Memory bridge and browser Memory client

**Files:**
- Modify: `frontend/src/core/settings-api-boundary.test.ts`
- Create: `frontend/src/app/api/memory/route.boundary.test.ts`
- Create: `frontend/src/app/api/memory/_proxy.ts`
- Create: `frontend/src/app/api/memory/route.ts`
- Create: `frontend/src/app/api/memory/[...path]/route.ts`
- Create: `frontend/src/core/memory/types.ts`
- Create: `frontend/src/core/memory/api.ts`
- Create: `frontend/src/core/memory/hooks.ts`
- Modify: `frontend/src/core/memory/index.ts`
- Test: `frontend/src/core/settings-api-boundary.test.ts`
- Test: `frontend/src/app/api/memory/route.boundary.test.ts`

- [ ] **Step 1: Write the failing Memory bridge and same-origin client tests**

Add a new route boundary file `frontend/src/app/api/memory/route.boundary.test.ts` with source assertions like:

```typescript
void test("memory routes require authenticated BFF context and forward X-User-Id", async () => {
  const rootSource = await readFile(new URL("./route.ts", import.meta.url), "utf8");
  const nestedSource = await readFile(new URL("./[...path]/route.ts", import.meta.url), "utf8");
  const proxySource = await readFile(new URL("./_proxy.ts", import.meta.url), "utf8");

  assert.ok(proxySource.includes("requireBffAuth"));
  assert.ok(proxySource.includes('headers.set("X-User-Id"'));
  assert.ok(proxySource.includes("/me"));
  assert.ok(rootSource.includes("proxyMemoryRequest(request, \"/api/memory\")"));
  assert.ok(nestedSource.includes("proxyMemoryRequest(request, `/api/memory/${(await params).path.join(\"/\")}`)"));
});
```

Change `frontend/src/core/settings-api-boundary.test.ts` so the memory section expects a restored same-origin client surface:

```typescript
void test("memory API uses same-origin memory routes", async () => {
  const source = await readSource("./memory/api.ts");

  assert.ok(
    source.includes('fetch("/api/memory"'),
    "expected memory API to use the same-origin /api/memory route",
  );
  assert.ok(
    !source.includes("getBackendBaseURL"),
    "expected memory API to stop reading the raw backend base URL",
  );
});
```

- [ ] **Step 2: Run the Memory boundary tests to verify they fail**

Run:

```bash
cd frontend && node --test src/core/settings-api-boundary.test.ts src/app/api/memory/route.boundary.test.ts
```

Expected: FAIL because `src/core/memory/api.ts` and the Memory route files do not exist yet.

- [ ] **Step 3: Implement the mem0-aware bridge and browser Memory client**

Create `frontend/src/app/api/memory/_proxy.ts` with a focused helper that resolves the authenticated user and forwards `X-User-Id`:

```ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { buildBffMeRequest } from "@/core/auth/bff";
import { requireBffAuth } from "@/server/bff/auth";
import { getInternalBffBaseURL } from "@/server/bff/internal";

const GATEWAY_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_BASE_URL ?? "http://127.0.0.1:8001";

export async function proxyMemoryRequest(request: NextRequest, pathname: string) {
  const auth = await requireBffAuth(request);
  if ("error" in auth) {
    return auth.error;
  }

  const meRequest = buildBffMeRequest({
    baseURL: getInternalBffBaseURL(),
    idToken: auth.bearerToken,
  });
  const meResponse = await fetch(meRequest.url, meRequest.init);
  const mePayload = (await meResponse.json()) as { id?: string; message?: string };

  if (!meResponse.ok || !mePayload.id) {
    return NextResponse.json(
      { code: "unauthenticated", message: mePayload.message ?? "Authenticated BFF user required" },
      { status: 401 },
    );
  }

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");
  headers.set("X-User-Id", mePayload.id);

  const target = new URL(pathname, GATEWAY_BASE_URL);
  target.search = request.nextUrl.search;

  const hasBody = !["GET", "HEAD"].includes(request.method);
  const response = await fetch(target, {
    method: request.method,
    headers,
    body: hasBody ? await request.arrayBuffer() : undefined,
  });

  return new Response(await response.arrayBuffer(), {
    status: response.status,
    headers: response.headers,
  });
}
```

Create `frontend/src/app/api/memory/route.ts` and `frontend/src/app/api/memory/[...path]/route.ts` using the shared helper:

```ts
import type { NextRequest } from "next/server";
import { proxyMemoryRequest } from "@/app/api/memory/_proxy";

export async function GET(request: NextRequest) {
  return proxyMemoryRequest(request, "/api/memory");
}

export async function DELETE(request: NextRequest) {
  return proxyMemoryRequest(request, "/api/memory");
}
```

```ts
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return proxyMemoryRequest(request, `/api/memory/${(await params).path.join("/")}`);
}
```

Restore the browser client surface in `frontend/src/core/memory/api.ts`, `hooks.ts`, `types.ts`, and `index.ts` using the `main` contracts but same-origin fetches:

```ts
export async function loadMemory(): Promise<UserMemory> {
  const response = await fetch("/api/memory");
  return readMemoryResponse(response, "Failed to fetch memory");
}

export async function createMemoryFact(input: MemoryFactInput): Promise<UserMemory> {
  const response = await fetch("/api/memory/facts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return readMemoryResponse(response, "Failed to create memory fact");
}
```

```ts
export function useMemory() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["memory"],
    queryFn: () => loadMemory(),
  });
  return { memory: data ?? null, isLoading, error };
}
```

- [ ] **Step 4: Re-run the Memory boundary tests to verify they pass**

Run:

```bash
cd frontend && node --test src/core/settings-api-boundary.test.ts src/app/api/memory/route.boundary.test.ts
```

Expected: PASS with a restored same-origin Memory client and mem0-aware Memory bridge.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/core/settings-api-boundary.test.ts frontend/src/app/api/memory/route.boundary.test.ts frontend/src/app/api/memory/_proxy.ts frontend/src/app/api/memory/route.ts frontend/src/app/api/memory/[...path]/route.ts frontend/src/core/memory/types.ts frontend/src/core/memory/api.ts frontend/src/core/memory/hooks.ts frontend/src/core/memory/index.ts
git commit -m "feat: restore mem0-aware memory bridge"
```

### Task 3: Restore the Settings Memory section and Memory page UI

**Files:**
- Modify: `frontend/src/components/workspace/settings/settings-dialog.boundary.test.ts`
- Create: `frontend/src/components/workspace/settings/memory-settings-page.boundary.test.ts`
- Modify: `frontend/src/components/workspace/settings/settings-dialog.tsx`
- Create: `frontend/src/components/workspace/settings/memory-settings-page.tsx`
- Test: `frontend/src/components/workspace/settings/settings-dialog.boundary.test.ts`
- Test: `frontend/src/components/workspace/settings/memory-settings-page.boundary.test.ts`

- [ ] **Step 1: Write the failing Memory UI boundary tests**

Update `frontend/src/components/workspace/settings/settings-dialog.boundary.test.ts` so it expects the restored section:

```typescript
void test("settings dialog exposes memory settings again", async () => {
  const source = await readSource("./settings-dialog.tsx");

  assert.ok(source.includes("MemorySettingsPage"));
  assert.ok(source.includes('"memory"'));
  assert.ok(source.includes("t.settings.sections.memory"));
});
```

Create `frontend/src/components/workspace/settings/memory-settings-page.boundary.test.ts` with assertions like:

```typescript
void test("memory settings page uses the restored memory hooks", async () => {
  const source = await readFile(new URL("./memory-settings-page.tsx", import.meta.url), "utf8");

  assert.ok(source.includes("useMemory"));
  assert.ok(source.includes("useCreateMemoryFact"));
  assert.ok(source.includes("useUpdateMemoryFact"));
  assert.ok(source.includes("useDeleteMemoryFact"));
  assert.ok(source.includes("useImportMemory"));
  assert.ok(source.includes("/workspace/chats"));
});
```

- [ ] **Step 2: Run the Memory UI tests to verify they fail**

Run:

```bash
cd frontend && node --test src/components/workspace/settings/settings-dialog.boundary.test.ts src/components/workspace/settings/memory-settings-page.boundary.test.ts
```

Expected: FAIL because the dialog still lacks the Memory section and the page file does not exist yet.

- [ ] **Step 3: Restore the dialog entry and Memory page from `main`, keeping the same interaction model**

Update `frontend/src/components/workspace/settings/settings-dialog.tsx` to reintroduce the section shape from `main`:

```tsx
import {
  BellIcon,
  BrainIcon,
  InfoIcon,
  PaletteIcon,
  SparklesIcon,
  WrenchIcon,
} from "lucide-react";
import { MemorySettingsPage } from "@/components/workspace/settings/memory-settings-page";

type SettingsSection =
  | "appearance"
  | "memory"
  | "tools"
  | "skills"
  | "notification"
  | "about";
```

```tsx
{
  id: "memory",
  label: t.settings.sections.memory,
  icon: BrainIcon,
},
```

```tsx
{activeSection === "memory" && <MemorySettingsPage />}
```

Create `frontend/src/components/workspace/settings/memory-settings-page.tsx` by restoring the `main` page and keeping its hook contract intact:

```tsx
"use client";

import { useDeferredValue, useId, useRef, useState } from "react";
import { toast } from "sonner";

import { useI18n } from "@/core/i18n/hooks";
import { exportMemory } from "@/core/memory/api";
import {
  useClearMemory,
  useCreateMemoryFact,
  useDeleteMemoryFact,
  useImportMemory,
  useMemory,
  useUpdateMemoryFact,
} from "@/core/memory/hooks";

export function MemorySettingsPage() {
  const { t } = useI18n();
  const { memory, isLoading, error } = useMemory();
  // keep the `main` summary + facts + import/export/add/edit/delete flow here
}
```

Use the `main` implementation for the page body, specifically preserving:

```text
- summary sections rendered from `memory.user` and `memory.history`
- facts list with search + filter
- add/edit fact dialog
- import/export buttons
- clear-all confirmation
- the existing time formatting and markdown export helpers
```

- [ ] **Step 4: Re-run the Memory UI tests to verify they pass**

Run:

```bash
cd frontend && node --test src/components/workspace/settings/settings-dialog.boundary.test.ts src/components/workspace/settings/memory-settings-page.boundary.test.ts
```

Expected: PASS with the restored Settings Memory section and page implementation.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/workspace/settings/settings-dialog.boundary.test.ts frontend/src/components/workspace/settings/memory-settings-page.boundary.test.ts frontend/src/components/workspace/settings/settings-dialog.tsx frontend/src/components/workspace/settings/memory-settings-page.tsx
git commit -m "feat: restore memory settings UI"
```

### Task 4: Restore the create-agent and agent-chat pages with the `main` flow

**Files:**
- Modify: `frontend/src/app/workspace/agents/agent-chat-auth-gate.boundary.test.ts`
- Create: `frontend/src/app/workspace/agents/agent-create-page.boundary.test.ts`
- Modify: `frontend/src/app/workspace/agents/new/page.tsx`
- Modify: `frontend/src/app/workspace/agents/[agent_name]/chats/[thread_id]/page.tsx`
- Test: `frontend/src/app/workspace/agents/agent-chat-auth-gate.boundary.test.ts`
- Test: `frontend/src/app/workspace/agents/agent-create-page.boundary.test.ts`

- [ ] **Step 1: Write the failing create-agent and agent-chat boundary tests**

Replace the disabled-state assertions in `frontend/src/app/workspace/agents/agent-chat-auth-gate.boundary.test.ts` with checks like:

```typescript
void test("agent chat page restores the login-aware shared chat shell", async () => {
  const source = await readFile(
    new URL("./[agent_name]/chats/[thread_id]/page.tsx", import.meta.url),
    "utf8",
  );

  assert.ok(source.includes("useLoginRequiredSubmit"));
  assert.ok(source.includes("useThreadStream"));
  assert.ok(source.includes("AgentWelcome"));
  assert.ok(!source.includes("AgentsDisabledState"));
});
```

Create `frontend/src/app/workspace/agents/agent-create-page.boundary.test.ts`:

```typescript
void test("new agent page restores the bootstrap creation flow", async () => {
  const source = await readFile(new URL("./new/page.tsx", import.meta.url), "utf8");

  assert.ok(source.includes("checkAgentName"));
  assert.ok(source.includes("createAgent"));
  assert.ok(source.includes("setup_agent"));
  assert.ok(source.includes("getAgentWithRetry"));
  assert.ok(!source.includes("AgentsDisabledState"));
});
```

- [ ] **Step 2: Run the agent-page tests to verify they fail**

Run:

```bash
cd frontend && node --test src/app/workspace/agents/agent-chat-auth-gate.boundary.test.ts src/app/workspace/agents/agent-create-page.boundary.test.ts
```

Expected: FAIL because both pages still render the shared disabled state.

- [ ] **Step 3: Restore the `main` create-agent and agent-chat pages, keeping current imports and auth helpers**

Restore `frontend/src/app/workspace/agents/new/page.tsx` from `main`, preserving the existing bootstrap flow:

```tsx
const [step, setStep] = useState<Step>("name");
const [nameInput, setNameInput] = useState("");
const [nameError, setNameError] = useState("");
const [agentName, setAgentName] = useState("");
const threadId = useMemo(() => uuid(), []);

const [thread, sendMessage] = useThreadStream({
  threadId: step === "chat" ? threadId : undefined,
  context: {
    mode: "flash",
    is_bootstrap: true,
  },
  onToolEnd({ name }) {
    if (name !== "setup_agent" || !agentName) return;
    void getAgentWithRetry(agentName).then((fetched) => {
      if (fetched) setAgent(fetched);
    });
  },
});
```

Restore `frontend/src/app/workspace/agents/[agent_name]/chats/[thread_id]/page.tsx` from `main`, but keep the current auth-aware submit guard:

```tsx
const {
  dialogOpen,
  setDialogOpen,
  callbackURL,
  restoredText,
  handleRestoredTextApplied,
  handleAuthenticated,
  handleBeforeOidcRedirect,
  guardSubmit,
} = useLoginRequiredSubmit();

const [thread, sendMessage] = useThreadStream({
  threadId: isNewThread ? undefined : threadId,
  context: { ...settings.context, agent_name },
  onStart: (createdThreadId) => {
    setThreadId(createdThreadId);
    setIsNewThread(false);
    history.replaceState(null, "", `/workspace/agents/${agent_name}/chats/${createdThreadId}`);
  },
});
```

Preserve the `main` chat shell pieces in the same file:

```text
- `ChatBox`
- `AgentWelcome`
- `MessageList`
- `InputBox`
- `ThreadTitle`
- `TodoList`
- `ArtifactTrigger`
- `ExportTrigger`
- `TokenUsageIndicator`
```

- [ ] **Step 4: Re-run the agent-page tests to verify they pass**

Run:

```bash
cd frontend && node --test src/app/workspace/agents/agent-chat-auth-gate.boundary.test.ts src/app/workspace/agents/agent-create-page.boundary.test.ts
```

Expected: PASS with the restored bootstrap and agent-chat flows.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/workspace/agents/agent-chat-auth-gate.boundary.test.ts frontend/src/app/workspace/agents/agent-create-page.boundary.test.ts frontend/src/app/workspace/agents/new/page.tsx frontend/src/app/workspace/agents/[agent_name]/chats/[thread_id]/page.tsx
git commit -m "feat: restore agent creation and chat pages"
```

### Task 5: Restore docs expectations and run focused verification

**Files:**
- Modify: `tests/root/makefile.boundary.test.mjs`
- Modify: `README.md`
- Modify: `frontend/README.md`
- Test: `tests/root/makefile.boundary.test.mjs`
- Test: `frontend/src/components/workspace/agents/agents-disabled.boundary.test.ts`
- Test: `frontend/src/app/workspace/agents/agent-chat-auth-gate.boundary.test.ts`
- Test: `frontend/src/app/workspace/agents/agent-create-page.boundary.test.ts`
- Test: `frontend/src/components/workspace/settings/settings-dialog.boundary.test.ts`
- Test: `frontend/src/components/workspace/settings/memory-settings-page.boundary.test.ts`
- Test: `frontend/src/core/settings-api-boundary.test.ts`
- Test: `frontend/src/app/api/memory/route.boundary.test.ts`

- [ ] **Step 1: Write the failing docs expectations for the restored Memory surface**

Update `tests/root/makefile.boundary.test.mjs` so it expects the repo docs to mention the restored browser Memory surface while preserving the newer `/bootstrap` command:

```javascript
void test("README documents the browser memory surface and channel commands", async () => {
  const readme = await readFile(new URL("../../README.md", import.meta.url), "utf8");

  assert.match(readme, /Settings > Memory/);
  assert.match(readme, /\| `\/memory` \|/);
  assert.match(readme, /\| `\/bootstrap` \|/);
});
```

- [ ] **Step 2: Run the docs test to verify it fails**

Run:

```bash
node --test tests/root/makefile.boundary.test.mjs
```

Expected: FAIL because the current root README intentionally omits `Settings > Memory` and `/memory`.

- [ ] **Step 3: Restore the README references and align frontend docs with the restored surface**

Update `README.md` using the `main` references for the restored browser Memory surface:

```md
This copies the sample fixture into the default local runtime memory file so reviewers can immediately test `Settings > Memory`.
```

```md
| `/bootstrap` | Start a bootstrap session (enables agent setup) |
| `/memory` | View memory |
```

Update `frontend/README.md` to describe the restored same-origin Memory ownership explicitly:

```md
- `/api/memory*` is a same-origin Next.js bridge to Gateway memory routes.
- When `memory.provider=mem0`, the bridge resolves the authenticated BFF user and forwards `X-User-Id` so Memory remains user-scoped.
- `Settings > Memory` is available again and uses the same-origin Memory bridge.
```

- [ ] **Step 4: Run focused verification for the restored feature slice**

Run the root docs test:

```bash
node --test tests/root/makefile.boundary.test.mjs
```

Expected: PASS.

Run the focused frontend boundary suite:

```bash
cd frontend && node --test \
  src/components/workspace/agents/agents-disabled.boundary.test.ts \
  src/app/workspace/agents/agent-chat-auth-gate.boundary.test.ts \
  src/app/workspace/agents/agent-create-page.boundary.test.ts \
  src/components/workspace/settings/settings-dialog.boundary.test.ts \
  src/components/workspace/settings/memory-settings-page.boundary.test.ts \
  src/core/settings-api-boundary.test.ts \
  src/app/api/memory/route.boundary.test.ts
```

Expected: PASS.

Run focused static validation on the changed frontend files:

```bash
cd frontend && pnpm exec eslint \
  src/components/workspace/workspace-nav-chat-list.tsx \
  src/app/workspace/agents/page.tsx \
  src/app/workspace/agents/new/page.tsx \
  src/app/workspace/agents/[agent_name]/chats/[thread_id]/page.tsx \
  src/app/api/memory/_proxy.ts \
  src/app/api/memory/route.ts \
  src/app/api/memory/[...path]/route.ts \
  src/components/workspace/settings/settings-dialog.tsx \
  src/components/workspace/settings/memory-settings-page.tsx \
  src/core/memory/api.ts \
  src/core/memory/hooks.ts \
  src/core/memory/types.ts
```

Expected: PASS with no new lint errors in the restored slice.

- [ ] **Step 5: Commit**

```bash
git add tests/root/makefile.boundary.test.mjs README.md frontend/README.md
git commit -m "docs: restore agents and memory surface docs"
```

## Self-Review

### Spec coverage

- Agents sidebar, gallery, create page, and agent chat are covered by Tasks 1 and 4.
- Memory bridge, mem0 `X-User-Id`, same-origin client, and Settings > Memory are covered by Tasks 2 and 3.
- README restoration and final verification are covered by Task 5.

### Placeholder scan

Run after saving the plan:

```bash
rg -n "T[B]D|T[O]DO|implement[[:space:]]later|fill[[:space:]]in[[:space:]]details|appropriate[[:space:]]error[[:space:]]handling|write[[:space:]]tests[[:space:]]for[[:space:]]the[[:space:]]above|similar[[:space:]]to[[:space:]]Task" docs/superpowers/plans/2026-04-21-restore-agents-and-memory-ui.md
```

Expected: no output.

### Type consistency

- `proxyMemoryRequest()` is the only new Memory bridge helper name used in route tasks.
- `UserMemory`, `MemoryFactInput`, and `MemoryFactPatchInput` are the browser types reused across `api.ts`, `hooks.ts`, and `memory-settings-page.tsx`.
- The create-agent task consistently uses `checkAgentName()`, `createAgent()`, `getAgentWithRetry()`, and `setup_agent`.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-21-restore-agents-and-memory-ui.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
