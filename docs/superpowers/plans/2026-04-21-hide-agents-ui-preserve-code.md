# Hide Agents UI While Preserving Code Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Temporarily hide the unfinished Agents product surface from the frontend while preserving the existing implementation behind a centralized feature gate for future BFF migration work.

**Architecture:** Keep all existing Agents code in place, but introduce one small frontend-owned feature flag that controls whether Agents UI is exposed. Use that flag in the sidebar entry and all Agents routes so the product is hidden consistently without deleting gallery, create, chat, or API-layer code that future BFF-owned work can reuse.

**Tech Stack:** Next.js App Router, React, TypeScript, Node `node:test`, existing `AgentsDisabledState` UI

---

## File Map

- `frontend/src/core/agents/feature.ts`
  - New single source of truth for whether Agents UI is exposed.
- `frontend/src/components/workspace/workspace-nav-chat-list.tsx`
  - Hides or shows the `Agents` sidebar entry via the shared feature flag.
- `frontend/src/app/workspace/agents/page.tsx`
  - Switches between `AgentGallery` and `AgentsDisabledState` using the shared feature flag.
- `frontend/src/app/workspace/agents/new/page.tsx`
  - Keeps the existing create-agent implementation in the file tree, but exports the disabled state while the feature flag is off.
- `frontend/src/app/workspace/agents/[agent_name]/chats/[thread_id]/page.tsx`
  - Keeps the existing agent chat implementation in the file tree, but exports the disabled state while the feature flag is off.
- `frontend/src/components/workspace/agents/agents-disabled.boundary.test.ts`
  - Verifies the sidebar entry is hidden and the routes render the disabled state.

### Task 1: Add a centralized Agents feature flag and hide the UI surface

**Files:**
- Create: `frontend/src/core/agents/feature.ts`
- Modify: `frontend/src/components/workspace/workspace-nav-chat-list.tsx`
- Modify: `frontend/src/app/workspace/agents/page.tsx`
- Modify: `frontend/src/app/workspace/agents/new/page.tsx`
- Modify: `frontend/src/app/workspace/agents/[agent_name]/chats/[thread_id]/page.tsx`
- Modify: `frontend/src/components/workspace/agents/agents-disabled.boundary.test.ts`
- Test: `frontend/src/components/workspace/agents/agents-disabled.boundary.test.ts`

- [ ] **Step 1: Write the failing boundary test for the hidden Agents surface**

Replace `frontend/src/components/workspace/agents/agents-disabled.boundary.test.ts` with:

```typescript
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("workspace navigation hides the agents entry while agent chat is disabled", async () => {
  const source = await readFile(
    new URL("../workspace-nav-chat-list.tsx", import.meta.url),
    "utf8",
  );

  assert.ok(
    !source.includes('href="/workspace/agents"'),
    "expected workspace navigation to stop exposing the disabled agents area",
  );
  assert.ok(
    source.includes("isAgentsUiEnabled"),
    "expected the sidebar to rely on the shared Agents feature flag",
  );
});

void test("agent routes render the shared disabled state instead of the preserved implementations", async () => {
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
      "../../../app/workspace/agents/[agent_name]/chats/[thread_id]/page.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  for (const [name, source] of [
    ["gallery", galleryPage],
    ["new-agent", newAgentPage],
    ["agent-chat", agentChatPage],
  ] as const) {
    assert.ok(
      source.includes("AgentsDisabledState"),
      `expected ${name} route to use the shared disabled-state component`,
    );
    assert.ok(
      source.includes("isAgentsUiEnabled"),
      `expected ${name} route to use the shared Agents feature flag`,
    );
  }
});
```

- [ ] **Step 2: Run the boundary test to verify it fails**

Run:

```bash
cd frontend && node --test src/components/workspace/agents/agents-disabled.boundary.test.ts
```

Expected: FAIL because the sidebar currently renders `href="/workspace/agents"` unconditionally and the routes do not yet use a shared feature flag.

- [ ] **Step 3: Implement the centralized hide-without-delete feature gate**

Create `frontend/src/core/agents/feature.ts`:

```ts
export function isAgentsUiEnabled() {
  return false;
}
```

Update `frontend/src/components/workspace/workspace-nav-chat-list.tsx` so the `Agents` nav item only renders when the feature flag is enabled:

```tsx
import { isAgentsUiEnabled } from "@/core/agents/feature";

{isAgentsUiEnabled() ? (
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
) : null}
```

Update the three Agents routes so they preserve the existing implementation but export the disabled state while the flag is off:

```tsx
import { AgentsDisabledState } from "@/components/workspace/agents/agents-disabled-state";
import { isAgentsUiEnabled } from "@/core/agents/feature";

export default function AgentsPage() {
  return isAgentsUiEnabled() ? <AgentGallery /> : <AgentsDisabledState />;
}
```

Apply the same pattern to `new/page.tsx` and `[agent_name]/chats/[thread_id]/page.tsx`: keep the current page implementation in the file, but gate the default export with `isAgentsUiEnabled()`.

- [ ] **Step 4: Re-run the boundary test to verify it passes**

Run:

```bash
cd frontend && node --test src/components/workspace/agents/agents-disabled.boundary.test.ts
```

Expected: PASS with the sidebar hidden and all routes rendering `AgentsDisabledState` through the shared feature flag.

- [ ] **Step 5: Run focused static validation**

Run:

```bash
cd frontend && pnpm exec eslint \
  src/core/agents/feature.ts \
  src/components/workspace/workspace-nav-chat-list.tsx \
  src/app/workspace/agents/page.tsx \
  src/app/workspace/agents/new/page.tsx \
  src/app/workspace/agents/[agent_name]/chats/[thread_id]/page.tsx \
  src/components/workspace/agents/agents-disabled.boundary.test.ts
```

Expected: PASS.

Run:

```bash
cd frontend && pnpm typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/core/agents/feature.ts frontend/src/components/workspace/workspace-nav-chat-list.tsx frontend/src/app/workspace/agents/page.tsx frontend/src/app/workspace/agents/new/page.tsx frontend/src/app/workspace/agents/[agent_name]/chats/[thread_id]/page.tsx frontend/src/components/workspace/agents/agents-disabled.boundary.test.ts
git commit -m "refactor: hide unfinished agents ui behind feature flag"
```

## Self-Review

### Spec coverage

- The sidebar entry is hidden without deleting implementation in Task 1.
- Agents routes fall back to `AgentsDisabledState` while preserving code in Task 1.
- The hide behavior is centralized in one feature flag rather than scattered conditionals.

### Placeholder scan

Run after saving the plan:

```bash
rg -n "T[B]D|T[O]DO|implement[[:space:]]later|fill[[:space:]]in[[:space:]]details|appropriate[[:space:]]error[[:space:]]handling|write[[:space:]]tests[[:space:]]for[[:space:]]the[[:space:]]above|similar[[:space:]]to[[:space:]]Task" docs/superpowers/plans/2026-04-21-hide-agents-ui-preserve-code.md
```

Expected: no output.

### Type consistency

- `isAgentsUiEnabled()` is the only shared flag introduced in this plan.
- All Agents routes reference the same feature flag helper.
- Existing Agents implementation code remains in place behind the gate.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-21-hide-agents-ui-preserve-code.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
