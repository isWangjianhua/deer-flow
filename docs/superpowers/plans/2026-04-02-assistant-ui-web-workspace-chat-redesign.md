# Assistant-UI Workspace Chat Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the current `apps/assistant-ui-web` workspace chat so it matches assistant-ui's shadcn template while restoring real streaming, clean title hierarchy, organized live tool/reasoning cards, document-quality markdown, and a right-side canvas.

**Architecture:** Keep the assistant-ui shell in `thread-screen.tsx` and `assistant-ui/thread.tsx`, but replace the ad hoc bridge in `assistant-ui-thread.tsx` with a clearer runtime-to-presentation model. Introduce a small presentation mapping layer that separates assistant body text, live event cards, and canvas payload, then compose the final workspace with shadcn `ResizablePanelGroup` so the right canvas is a first-class panel instead of improvised inline content.

**Tech Stack:** Next.js 16, React 19, TypeScript 5.8, `@assistant-ui/react`, `@assistant-ui/react-markdown`, shadcn/ui, `react-resizable-panels`, Vitest

---

## File Structure

- `apps/assistant-ui-web/src/lib/runtime/message-converter.ts`
  Tighten raw DeerFlow message conversion so assistant turns preserve enough structure for stable rendering.
- `apps/assistant-ui-web/src/lib/runtime/message-converter.test.ts`
  Cover assistant body, reasoning/tool grouping, and non-leaking event boundaries.
- `apps/assistant-ui-web/src/lib/runtime/thread-presentation.ts`
  New pure transformation layer that maps assistant-ui messages plus live events into workspace render blocks.
- `apps/assistant-ui-web/src/lib/runtime/thread-presentation.test.ts`
  New tests for live event cards, canvas payload extraction, and assistant body continuity.
- `apps/assistant-ui-web/src/components/assistant-ui-thread.tsx`
  Replace the current custom `MessageRenderer` and manual composer shell with a template-aligned workspace bridge.
- `apps/assistant-ui-web/src/components/assistant-ui/thread.tsx`
  Keep this as the template source of truth and add only narrow extension points needed by the workspace bridge.
- `apps/assistant-ui-web/src/components/thread-screen.tsx`
  Upgrade the page shell to a title-first, resizable two-panel workspace.
- `apps/assistant-ui-web/src/components/workspace/canvas-panel.tsx`
  New right-side canvas panel for artifacts and file previews.
- `apps/assistant-ui-web/src/components/workspace/event-card.tsx`
  New consistent card used for reasoning, tool calls, tool results, and task progress.
- `apps/assistant-ui-web/src/components/tool-ui/index.tsx`
  Keep tool routing, but render all tools through the shared event-card presentation.
- `apps/assistant-ui-web/src/components/tool-ui/web-search.tsx`
  Improve search result rendering to match assistant-ui document tone.
- `apps/assistant-ui-web/src/components/tool-ui/read-file.tsx`
  Improve file preview summary rendering.
- `apps/assistant-ui-web/src/components/tool-ui/command.tsx`
  Improve command/status rendering.
- `apps/assistant-ui-web/src/components/assistant-ui/markdown-text.tsx`
  Refine markdown spacing and document feel without diverging from assistant-ui style.

## Task 1: Build the Presentation Mapping Layer

**Files:**
- Modify: `apps/assistant-ui-web/src/lib/runtime/message-converter.ts`
- Modify: `apps/assistant-ui-web/src/lib/runtime/message-converter.test.ts`
- Create: `apps/assistant-ui-web/src/lib/runtime/thread-presentation.ts`
- Test: `apps/assistant-ui-web/src/lib/runtime/thread-presentation.test.ts`

- [ ] **Step 1: Write the failing presentation tests**

```ts
import { describe, expect, it } from "vitest";

import { buildThreadPresentation } from "./thread-presentation";
import type { AssistantUiMessage } from "./message-converter";
import type { ChatStreamEvent } from "./chat-stream";

describe("thread presentation", () => {
  it("keeps assistant body text separate from reasoning and tool cards", () => {
    const messages: AssistantUiMessage[] = [
      {
        id: "assistant_1",
        role: "assistant",
        parts: [
          { type: "reasoning", text: "need to search first" },
          {
            type: "tool-call",
            toolCallId: "call_1",
            toolName: "web_search",
            args: { query: "Shanghai weather" },
          },
          {
            type: "tool-result",
            toolCallId: "call_1",
            toolName: "web_search",
            content: "{\"results\":[{\"title\":\"Weather\"}]}",
          },
          { type: "text", text: "Tomorrow will be cloudy." },
        ],
      },
    ];

    const presentation = buildThreadPresentation(messages, []);

    expect(presentation.blocks).toEqual([
      {
        id: "assistant_1",
        role: "assistant",
        body: "Tomorrow will be cloudy.",
        events: [
          { kind: "reasoning", id: "assistant_1:reasoning:0" },
          { kind: "tool", id: "call_1" },
        ],
      },
    ]);
  });

  it("keeps live tool events inside cards while text deltas grow the assistant body", () => {
    const events: ChatStreamEvent[] = [
      { type: "text-start", id: "live_1" },
      {
        type: "data-tool-call",
        data: { toolCallId: "call_live", name: "read_file", args: { path: "README.md" } },
      },
      { type: "text-delta", id: "live_1", delta: "Reading the file now." },
      {
        type: "data-tool-result",
        data: { toolCallId: "call_live", name: "read_file", content: "# README" },
      },
    ];

    const presentation = buildThreadPresentation([], events);

    expect(presentation.liveBlock?.body).toBe("Reading the file now.");
    expect(presentation.liveBlock?.events.map((event) => event.id)).toEqual(["call_live"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/assistant-ui-web && pnpm exec vitest run src/lib/runtime/message-converter.test.ts src/lib/runtime/thread-presentation.test.ts`

Expected: FAIL with `Cannot find module './thread-presentation'` and/or assertion failures proving the new boundaries are not implemented yet.

- [ ] **Step 3: Implement the minimal presentation layer and tighten converter behavior**

```ts
// apps/assistant-ui-web/src/lib/runtime/thread-presentation.ts
import type { ChatStreamEvent } from "./chat-stream";
import type { AssistantUiMessage } from "./message-converter";

export type ThreadEventCard =
  | { id: string; kind: "reasoning"; title: string; content: string; status: "done" | "streaming" }
  | { id: string; kind: "tool"; title: string; toolName: string; args: Record<string, unknown>; content?: string; status: "pending" | "done" };

export type ThreadRenderBlock = {
  id: string;
  role: "user" | "assistant";
  body: string;
  events: ThreadEventCard[];
};

export function buildThreadPresentation(
  messages: AssistantUiMessage[],
  liveEvents: ChatStreamEvent[],
  artifacts: string[] = [],
): {
  blocks: ThreadRenderBlock[];
  liveBlock: ThreadRenderBlock | null;
  canvas: { items: string[] };
} {
  // Map persisted assistant messages to stable blocks.
  // Map live SSE events to a transient assistant block with its own body/events.
  return {
    blocks: messages.map((message) => ({
      id: message.id,
      role: message.role,
      body: message.parts.filter((part) => part.type === "text").map((part) => part.text).join("\n"),
      events: [],
    })),
    liveBlock: null,
    canvas: { items: artifacts },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/assistant-ui-web && pnpm exec vitest run src/lib/runtime/message-converter.test.ts src/lib/runtime/thread-presentation.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/assistant-ui-web/src/lib/runtime/message-converter.ts \
  apps/assistant-ui-web/src/lib/runtime/message-converter.test.ts \
  apps/assistant-ui-web/src/lib/runtime/thread-presentation.ts \
  apps/assistant-ui-web/src/lib/runtime/thread-presentation.test.ts
git commit -m "feat: add assistant ui thread presentation mapping"
```

### Task 2: Rebuild the Workspace Thread Around the Assistant-UI Template

**Files:**
- Modify: `apps/assistant-ui-web/src/components/assistant-ui-thread.tsx`
- Modify: `apps/assistant-ui-web/src/components/assistant-ui/thread.tsx`
- Test: `apps/assistant-ui-web/src/lib/runtime/thread-presentation.test.ts`

- [ ] **Step 1: Write the failing runtime bridge tests for live body and event updates**

```ts
import { describe, expect, it } from "vitest";

import { buildThreadPresentation } from "@/lib/runtime/thread-presentation";

describe("assistant-ui runtime bridge", () => {
  it("produces a stable live assistant block while streaming text deltas", () => {
    const presentation = buildThreadPresentation([], [
      { type: "text-start", id: "live_1" },
      { type: "text-delta", id: "live_1", delta: "Hello" },
      { type: "text-delta", id: "live_1", delta: " world" },
    ]);

    expect(presentation.liveBlock?.body).toBe("Hello world");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/assistant-ui-web && pnpm exec vitest run src/lib/runtime/thread-presentation.test.ts`

Expected: FAIL because live text deltas are not yet assembled into the new block model.

- [ ] **Step 3: Replace the custom message renderer with a template-aligned bridge**

```tsx
// apps/assistant-ui-web/src/components/assistant-ui-thread.tsx
import { Thread } from "@/components/assistant-ui/thread";
import { buildThreadPresentation } from "@/lib/runtime/thread-presentation";

export function AssistantUiThread({ initialState, ensureAuthenticated, onStateChange }: AssistantUiThreadProps) {
  const [runtimeState, setRuntimeState] = useState<DeerFlowRuntimeState | null>(initialState);
  const [isRunning, setIsRunning] = useState(false);

  const presentation = useMemo(
    () =>
      buildThreadPresentation(
        runtimeState?.messages ?? [],
        runtimeState?.liveEvents ?? [],
        runtimeState?.artifacts ?? [],
      ),
    [runtimeState],
  );

  const runtime = useExternalStoreRuntime(
    useMemo(
      () => ({
        isRunning,
        messages: presentation.blocks.map(toThreadMessageLike),
        convertMessage: (message: ThreadMessageLike) => message,
        onNew: async (message: AppendMessage) => {
          // keep the optimistic user flow, but persist SSE updates into runtimeState.liveEvents
        },
      }),
      [isRunning, presentation.blocks],
    ),
  );

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <Thread />
    </AssistantRuntimeProvider>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/assistant-ui-web && pnpm exec vitest run src/lib/runtime/thread-presentation.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/assistant-ui-web/src/components/assistant-ui-thread.tsx \
  apps/assistant-ui-web/src/components/assistant-ui/thread.tsx \
  apps/assistant-ui-web/src/lib/runtime/thread-presentation.test.ts
git commit -m "feat: align assistant ui thread bridge with template"
```

### Task 3: Add the Right-Side Canvas and Title-First Workspace Layout

**Files:**
- Modify: `apps/assistant-ui-web/src/components/thread-screen.tsx`
- Create: `apps/assistant-ui-web/src/components/workspace/canvas-panel.tsx`
- Modify: `apps/assistant-ui-web/src/components/ui/resizable.tsx`
- Modify: `apps/assistant-ui-web/src/lib/runtime/deerflow-runtime.ts`
- Test: `apps/assistant-ui-web/src/lib/runtime/thread-presentation.test.ts`

- [ ] **Step 1: Write the failing canvas payload test**

```ts
import { describe, expect, it } from "vitest";

import { buildThreadPresentation } from "./thread-presentation";

describe("canvas payload", () => {
  it("exposes artifact paths for the right canvas", () => {
    const presentation = buildThreadPresentation([], [], ["/tmp/report.md"]);

    expect(presentation.canvas.items).toEqual(["/tmp/report.md"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/assistant-ui-web && pnpm exec vitest run src/lib/runtime/thread-presentation.test.ts`

Expected: FAIL because no canvas payload exists yet.

- [ ] **Step 3: Implement the resizable two-panel workspace**

```tsx
// apps/assistant-ui-web/src/components/thread-screen.tsx
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { CanvasPanel } from "@/components/workspace/canvas-panel";

<ResizablePanelGroup className="min-h-0 flex-1" direction="horizontal">
  <ResizablePanel defaultSize={64} minSize={45}>
    <AssistantUiThread
      ensureAuthenticated={ensureAuthenticated}
      initialState={runtimeState}
      onStateChange={(nextState) => {
        setRuntimeState(nextState);
        if (nextState.conversationId && nextState.conversationId !== conversationId) {
          setConversationId(nextState.conversationId);
          router.replace(`/workspace/${nextState.conversationId}`);
        }
      }}
    />
  </ResizablePanel>
  <ResizableHandle withHandle />
  <ResizablePanel defaultSize={36} minSize={24}>
    <CanvasPanel
      artifacts={runtimeState?.artifacts ?? []}
      title={runtimeState?.title ?? "New Thread"}
    />
  </ResizablePanel>
</ResizablePanelGroup>
```

- [ ] **Step 4: Run tests and typecheck**

Run: `cd apps/assistant-ui-web && pnpm exec vitest run src/lib/runtime/thread-presentation.test.ts && pnpm typecheck`

Expected: PASS for Vitest, PASS for TypeScript

- [ ] **Step 5: Commit**

```bash
git add apps/assistant-ui-web/src/components/thread-screen.tsx \
  apps/assistant-ui-web/src/components/workspace/canvas-panel.tsx \
  apps/assistant-ui-web/src/components/ui/resizable.tsx \
  apps/assistant-ui-web/src/lib/runtime/deerflow-runtime.ts \
  apps/assistant-ui-web/src/lib/runtime/thread-presentation.test.ts
git commit -m "feat: add assistant ui workspace canvas panel"
```

### Task 4: Normalize Event Cards and Markdown Presentation

**Files:**
- Create: `apps/assistant-ui-web/src/components/workspace/event-card.tsx`
- Modify: `apps/assistant-ui-web/src/components/tool-ui/index.tsx`
- Modify: `apps/assistant-ui-web/src/components/tool-ui/web-search.tsx`
- Modify: `apps/assistant-ui-web/src/components/tool-ui/read-file.tsx`
- Modify: `apps/assistant-ui-web/src/components/tool-ui/command.tsx`
- Modify: `apps/assistant-ui-web/src/components/assistant-ui/markdown-text.tsx`
- Test: `apps/assistant-ui-web/src/lib/runtime/message-converter.test.ts`

- [ ] **Step 1: Write the failing regression test for tool/result ordering**

```ts
import { describe, expect, it } from "vitest";

import { convertDeerFlowMessages } from "./message-converter";

describe("tool ordering", () => {
  it("keeps tool results attached to the same assistant turn instead of leaking into plain text", () => {
    const messages = convertDeerFlowMessages([
      {
        id: "ai_1",
        type: "ai",
        content: "",
        tool_calls: [{ id: "call_1", name: "read_file", args: { path: "README.md" } }],
      },
      {
        id: "tool_1",
        type: "tool",
        tool_call_id: "call_1",
        name: "read_file",
        content: "# README",
      },
      {
        id: "ai_2",
        type: "ai",
        content: "Here is the summary.",
      },
    ]);

    expect(messages[0]?.role).toBe("assistant");
    expect(messages[0]?.parts.map((part) => part.type)).toEqual([
      "tool-call",
      "tool-result",
      "text",
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/assistant-ui-web && pnpm exec vitest run src/lib/runtime/message-converter.test.ts`

Expected: FAIL if ordering/regression is still incorrect.

- [ ] **Step 3: Implement shared event cards and restrained markdown polish**

```tsx
// apps/assistant-ui-web/src/components/workspace/event-card.tsx
export function EventCard({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <details className="overflow-hidden rounded-2xl border border-border bg-card">
      <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{title}</span>
        <span className="truncate">{summary}</span>
      </summary>
      <div className="border-t border-border px-4 py-4">{children}</div>
    </details>
  );
}
```

```tsx
// apps/assistant-ui-web/src/components/tool-ui/index.tsx
import { EventCard } from "@/components/workspace/event-card";

export function ToolCard({ toolName, args, content }: ToolRendererProps) {
  return (
    <EventCard title={toolName} summary={content ? "Completed" : "Running"}>
      {/* delegate to tool-specific body */}
    </EventCard>
  );
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `cd apps/assistant-ui-web && pnpm exec vitest run src/lib/runtime/message-converter.test.ts src/lib/runtime/thread-presentation.test.ts && pnpm typecheck`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/assistant-ui-web/src/components/workspace/event-card.tsx \
  apps/assistant-ui-web/src/components/tool-ui/index.tsx \
  apps/assistant-ui-web/src/components/tool-ui/web-search.tsx \
  apps/assistant-ui-web/src/components/tool-ui/read-file.tsx \
  apps/assistant-ui-web/src/components/tool-ui/command.tsx \
  apps/assistant-ui-web/src/components/assistant-ui/markdown-text.tsx \
  apps/assistant-ui-web/src/lib/runtime/message-converter.test.ts
git commit -m "feat: polish assistant ui event cards and markdown"
```

### Task 5: Final Workspace Verification

**Files:**
- Modify: `apps/assistant-ui-web/src/components/thread-screen.tsx`
- Modify: `apps/assistant-ui-web/src/components/assistant-ui-thread.tsx`
- Test: `apps/assistant-ui-web/src/lib/runtime/message-converter.test.ts`
- Test: `apps/assistant-ui-web/src/lib/runtime/thread-presentation.test.ts`

- [ ] **Step 1: Run the focused automated checks**

Run: `cd apps/assistant-ui-web && pnpm exec vitest run src/lib/runtime/message-converter.test.ts src/lib/runtime/thread-presentation.test.ts src/lib/runtime/chat-stream.test.ts`

Expected: PASS

- [ ] **Step 2: Run the full typecheck**

Run: `cd apps/assistant-ui-web && pnpm typecheck`

Expected: PASS

- [ ] **Step 3: Manually verify the required UX outcomes**

```text
1. Open the assistant-ui frontend workspace.
2. Confirm the header title shows "New Thread" before the first send.
3. Send a prompt that triggers tool usage.
4. Confirm reasoning/tool cards appear live while text continues to stream.
5. Confirm tool/result text stays inside event cards.
6. Confirm assistant markdown renders with clean headings, code blocks, lists, and tables.
7. Confirm the right canvas opens and remains usable for artifacts/previews.
8. Confirm the page still reads like assistant-ui's shadcn template, not a custom redesign.
```

- [ ] **Step 4: Re-run the automated checks after any manual verification fix**

Run: `cd apps/assistant-ui-web && pnpm exec vitest run src/lib/runtime/message-converter.test.ts src/lib/runtime/thread-presentation.test.ts src/lib/runtime/chat-stream.test.ts && pnpm typecheck`

Expected: PASS again after any final verification-driven fix.

- [ ] **Step 5: Commit**

```bash
git add apps/assistant-ui-web/src/components/thread-screen.tsx \
  apps/assistant-ui-web/src/components/assistant-ui-thread.tsx
git commit -m "fix: finalize assistant ui workspace chat redesign"
```
