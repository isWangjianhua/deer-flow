# Hide Empty Memory Summaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide the empty Memory summary sections and summary-related filters when the current user has only facts and all six summary slots are blank.

**Architecture:** Keep the existing readonly Memory page and BFF-owned Memory contract intact. Only adjust frontend rendering logic so the page becomes a facts-only viewer when `isMemorySummaryEmpty(memory)` is true, while preserving the ability to automatically restore summary sections if future backend work starts returning non-empty summaries.

**Tech Stack:** React, Next.js App Router, TypeScript, Node `node:test`, readonly BFF-backed Memory UI

---

## File Map

- `frontend/src/components/workspace/settings/memory-settings-page.tsx`
  - Main rendering logic for the readonly Memory page; will conditionally hide empty summary sections and their filters.
- `frontend/src/components/workspace/settings/memory-settings-page.boundary.test.ts`
  - Boundary test proving summary-empty logic is wired into the page and summary-specific controls are not forced to render.

### Task 1: Hide summary-only UI when all summary slots are empty

**Files:**
- Modify: `frontend/src/components/workspace/settings/memory-settings-page.boundary.test.ts`
- Modify: `frontend/src/components/workspace/settings/memory-settings-page.tsx`
- Test: `frontend/src/components/workspace/settings/memory-settings-page.boundary.test.ts`

- [ ] **Step 1: Write the failing boundary test for empty-summary behavior**

Replace `frontend/src/components/workspace/settings/memory-settings-page.boundary.test.ts` with:

```typescript
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("memory settings page stays readonly and handles unauthenticated state", async () => {
  const source = await readFile(
    new URL("./memory-settings-page.tsx", import.meta.url),
    "utf8",
  );

  assert.ok(source.includes("useMemory"));
  assert.ok(!source.includes("useCreateMemoryFact"));
  assert.ok(!source.includes("useUpdateMemoryFact"));
  assert.ok(!source.includes("useDeleteMemoryFact"));
  assert.ok(!source.includes("useImportMemory"));
  assert.ok(!source.includes("useClearMemory"));
  assert.ok(!source.includes("PlusIcon"));
  assert.ok(!source.includes("Trash2Icon"));
  assert.ok(source.includes("isUnauthenticated"));
});

void test("memory settings page hides summary sections when all summaries are empty", async () => {
  const source = await readFile(
    new URL("./memory-settings-page.tsx", import.meta.url),
    "utf8",
  );

  assert.ok(source.includes("isMemorySummaryEmpty(memory)"));
  assert.ok(source.includes("const summariesAvailable = memory ? !isMemorySummaryEmpty(memory) : false;"));
  assert.ok(source.includes("const showSummaries =\n    summariesAvailable && (filter === \"all\" || filter === \"summaries\");"));
  assert.ok(source.includes("{summariesAvailable ? ("));
  assert.ok(!source.includes("{t.settings.memory.filterSummaries}"));
});
```

- [ ] **Step 2: Run the boundary test to verify it fails**

Run:

```bash
cd frontend && node --test src/components/workspace/settings/memory-settings-page.boundary.test.ts
```

Expected: FAIL because the current page still always renders the summary filter button and summary read-only helper copy regardless of whether summaries exist.

- [ ] **Step 3: Implement the smallest rendering change in `memory-settings-page.tsx`**

Add the derived availability flag after `memory` is loaded:

```tsx
const summariesAvailable = memory ? !isMemorySummaryEmpty(memory) : false;
```

Change the summary visibility computation to:

```tsx
const showSummaries =
  summariesAvailable && (filter === "all" || filter === "summaries");
```

Update the helper card so summary-only copy is hidden when summaries are unavailable:

```tsx
{summariesAvailable ? (
  <div className="text-muted-foreground text-sm">
    {t.settings.memory.summaryReadOnly}
  </div>
) : null}
```

Render the filter controls conditionally so only the facts filter remains in the empty-summary case:

```tsx
<ToggleGroup
  type="single"
  value={summariesAvailable ? filter : "facts"}
  onValueChange={(value) => {
    if (
      value === "all" ||
      value === "facts" ||
      (summariesAvailable && value === "summaries")
    ) {
      setFilter(value as MemoryViewFilter);
    }
  }}
>
  {summariesAvailable ? (
    <>
      <ToggleGroupItem value="all">
        {t.settings.memory.filterAll}
      </ToggleGroupItem>
      <ToggleGroupItem value="summaries">
        {t.settings.memory.filterSummaries}
      </ToggleGroupItem>
    </>
  ) : null}
  <ToggleGroupItem value="facts">
    {t.settings.memory.filterFacts}
  </ToggleGroupItem>
</ToggleGroup>
```

Keep the facts section unchanged, and do not remove `isMemorySummaryEmpty()` because the future auto-restore behavior depends on it.

- [ ] **Step 4: Re-run the boundary test to verify it passes**

Run:

```bash
cd frontend && node --test src/components/workspace/settings/memory-settings-page.boundary.test.ts
```

Expected: PASS with the page now hiding summary-only UI when all summaries are empty.

- [ ] **Step 5: Run focused static validation for the touched file**

Run:

```bash
cd frontend && pnpm exec eslint src/components/workspace/settings/memory-settings-page.tsx src/components/workspace/settings/memory-settings-page.boundary.test.ts
```

Expected: PASS.

Run:

```bash
cd frontend && pnpm typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/workspace/settings/memory-settings-page.tsx frontend/src/components/workspace/settings/memory-settings-page.boundary.test.ts
git commit -m "refactor: hide empty memory summaries"
```

## Self-Review

### Spec coverage

- Empty summary sections are hidden in Task 1.
- Summary-only filters are hidden in Task 1.
- Facts rendering, readonly behavior, and unauthenticated state are preserved in Task 1.
- Future auto-restore of summaries is preserved by keeping `isMemorySummaryEmpty()` and summary render logic conditional rather than deleting it.

### Placeholder scan

Run after saving the plan:

```bash
rg -n "T[B]D|T[O]DO|implement[[:space:]]later|fill[[:space:]]in[[:space:]]details|appropriate[[:space:]]error[[:space:]]handling|write[[:space:]]tests[[:space:]]for[[:space:]]the[[:space:]]above|similar[[:space:]]to[[:space:]]Task" docs/superpowers/plans/2026-04-21-hide-empty-memory-summaries.md
```

Expected: no output.

### Type consistency

- `summariesAvailable` is the only new derived flag introduced in the plan.
- `MemoryViewFilter` remains the same union type.
- `isMemorySummaryEmpty(memory)` remains the source of truth for deciding whether summary UI exists.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-21-hide-empty-memory-summaries.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
