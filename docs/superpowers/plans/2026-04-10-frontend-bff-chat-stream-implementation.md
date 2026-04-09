# Frontend BFF Chat Stream Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the main frontend chat path with a BFF-owned conversation and streaming protocol while preserving the existing workspace chat UI.

**Architecture:** Introduce a `core/bff-chat` boundary in the frontend, normalize downstream runtime events into stable BFF product events, and migrate the main workspace chat route from `thread_id` semantics to `conversation_id`. Reuse current message/input/layout components, but switch the primary data flow from LangGraph/runtime-native semantics to `frontend -> BFF -> gateway/agentruntime`.

**Tech Stack:** Next.js App Router, React 19, FastAPI BFF, SSE over `fetch` + `ReadableStream`, Node.js `node:test`, Playwright, pytest, existing workspace UI components.

---

## File Structure

### Create

- `frontend/src/core/bff-chat/types.ts`
- `frontend/src/core/bff-chat/api.ts`
- `frontend/src/core/bff-chat/stream.ts`
- `frontend/src/core/bff-chat/state.ts`
- `frontend/src/core/bff-chat/index.ts`
- `frontend/src/core/bff-chat/api.test.ts`
- `frontend/src/core/bff-chat/stream.test.ts`
- `frontend/src/core/bff-chat/state.test.ts`
- `frontend/src/components/workspace/messages/tool-event-card.tsx`
- `frontend/tests/e2e/bff-chat.spec.ts`
- `bff/tests/api/test_bff_chat_stream_contract.py`

### Modify

- `frontend/src/app/workspace/chats/[thread_id]/page.tsx`
- `frontend/src/app/workspace/chats/[thread_id]/layout.tsx`
- `frontend/src/app/workspace/chats/page.tsx`
- `frontend/src/components/workspace/chats/use-thread-chat.ts`
- `frontend/src/components/workspace/chats/chat-box.tsx`
- `frontend/src/components/workspace/input-box.tsx`
- `frontend/src/components/workspace/messages/message-list-item.tsx`
- `frontend/src/components/workspace/messages/index.ts`
- `frontend/src/core/threads/types.ts`
- `frontend/src/core/threads/hooks.ts`
- `frontend/src/core/threads/index.ts`
- `frontend/src/core/threads/utils.ts`
- `frontend/src/components/workspace/workspace-nav-chat-list.tsx`
- `frontend/src/components/workspace/recent-chat-list.tsx`
- `frontend/src/components/workspace/thread-title.tsx`
- `frontend/src/components/workspace/streaming-indicator.tsx`
- `frontend/README.md`
- `frontend/.env.example`
- `frontend/package.json`
- `frontend/playwright.config.ts`
- `bff/app/schemas/conversation.py`
- `bff/app/api/routes/conversations.py`
- `bff/app/services/conversation_service.py`
- `bff/app/sse/proxy.py`
- `bff/tests/api/test_conversation_routes.py`
- `bff/tests/api/test_stream_routes.py`

## Task 1: Define Frontend BFF Chat Types And API Client

**Files:**
- Create: `frontend/src/core/bff-chat/types.ts`
- Create: `frontend/src/core/bff-chat/api.ts`
- Create: `frontend/src/core/bff-chat/api.test.ts`
- Create: `frontend/src/core/bff-chat/index.ts`
- Modify: `frontend/package.json`

- [ ] **Step 1: Write a failing API client test**

Create `frontend/src/core/bff-chat/api.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

const { createConversation, listConversations } = await import(
  new URL("./api.ts", import.meta.url).href,
);

void test("creates a conversation through the BFF", async () => {
  const result = await createConversation(async (input, init) => {
    assert.equal(input, "/api/bff/conversations");
    assert.equal(init?.method, "POST");

    return new Response(
      JSON.stringify({
        id: "conversation-1",
        title: "New chat",
        created_at: "2026-04-10T00:00:00Z",
        updated_at: "2026-04-10T00:00:00Z",
      }),
      { status: 201, headers: { "content-type": "application/json" } },
    );
  });

  assert.equal(result.id, "conversation-1");
});

void test("lists conversations through the BFF", async () => {
  const result = await listConversations(async (input) => {
    assert.equal(input, "/api/bff/conversations");

    return new Response(
      JSON.stringify([
        {
          id: "conversation-1",
          title: "Existing chat",
          created_at: "2026-04-10T00:00:00Z",
          updated_at: "2026-04-10T00:00:00Z",
        },
      ]),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });

  assert.equal(result.length, 1);
  assert.equal(result[0]?.title, "Existing chat");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node src/core/bff-chat/api.test.ts`
Expected: FAIL with `Cannot find module` for `./api.ts`

- [ ] **Step 3: Add focused BFF chat types**

Create `frontend/src/core/bff-chat/types.ts`:

```ts
export type BffConversation = {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
};

export type BffConversationList = BffConversation[];

export type CreateConversationResult = BffConversation;
```

- [ ] **Step 4: Implement the minimal API client**

Create `frontend/src/core/bff-chat/api.ts`:

```ts
import type {
  BffConversationList,
  CreateConversationResult,
} from "./types";

type FetchLike = typeof fetch;

export async function createConversation(fetchImpl: FetchLike = fetch) {
  const response = await fetchImpl("/api/bff/conversations", {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("Failed to create conversation");
  }

  return (await response.json()) as CreateConversationResult;
}

export async function listConversations(fetchImpl: FetchLike = fetch) {
  const response = await fetchImpl("/api/bff/conversations");

  if (!response.ok) {
    throw new Error("Failed to list conversations");
  }

  return (await response.json()) as BffConversationList;
}
```

Create `frontend/src/core/bff-chat/index.ts`:

```ts
export * from "./api";
export * from "./types";
```

- [ ] **Step 5: Run the API client test to verify it passes**

Run: `node src/core/bff-chat/api.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/core/bff-chat/types.ts frontend/src/core/bff-chat/api.ts frontend/src/core/bff-chat/api.test.ts frontend/src/core/bff-chat/index.ts
git commit -m "feat: add frontend bff chat api client"
```

## Task 2: Define And Parse Stable BFF Stream Events

**Files:**
- Create: `frontend/src/core/bff-chat/stream.ts`
- Create: `frontend/src/core/bff-chat/stream.test.ts`
- Modify: `frontend/src/core/bff-chat/types.ts`
- Modify: `frontend/src/core/bff-chat/index.ts`

- [ ] **Step 1: Write a failing stream parser test**

Create `frontend/src/core/bff-chat/stream.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

const { parseBffStreamChunk } = await import(
  new URL("./stream.ts", import.meta.url).href,
);

void test("parses a message delta event from SSE data", () => {
  const result = parseBffStreamChunk(
    "event: message.delta\\ndata: {\"message_id\":\"assistant-1\",\"delta\":\"Hello\"}\\n\\n",
  );

  assert.deepEqual(result, [
    {
      type: "message.delta",
      data: {
        message_id: "assistant-1",
        delta: "Hello",
      },
    },
  ]);
});

void test("parses tool lifecycle events from SSE data", () => {
  const result = parseBffStreamChunk(
    [
      "event: tool.started",
      "data: {\"tool_call_id\":\"tool-1\",\"label\":\"Searching web\"}",
      "",
      "event: tool.completed",
      "data: {\"tool_call_id\":\"tool-1\"}",
      "",
    ].join("\\n"),
  );

  assert.equal(result.length, 2);
  assert.equal(result[0]?.type, "tool.started");
  assert.equal(result[1]?.type, "tool.completed");
});
```

- [ ] **Step 2: Run the stream test to verify it fails**

Run: `node src/core/bff-chat/stream.test.ts`
Expected: FAIL with `Cannot find module` for `./stream.ts`

- [ ] **Step 3: Extend chat event types**

Append to `frontend/src/core/bff-chat/types.ts`:

```ts
export type BffChatEvent =
  | {
      type: "message.started";
      data: { message_id: string };
    }
  | {
      type: "message.delta";
      data: { message_id: string; delta: string };
    }
  | {
      type: "message.completed";
      data: { message_id: string };
    }
  | {
      type: "tool.started";
      data: { tool_call_id: string; label: string };
    }
  | {
      type: "tool.progress";
      data: { tool_call_id: string; message: string };
    }
  | {
      type: "tool.completed";
      data: { tool_call_id: string };
    }
  | {
      type: "tool.failed";
      data: { tool_call_id: string; message: string };
    }
  | {
      type: "run.failed";
      data: { message: string; code: string };
    };
```

- [ ] **Step 4: Implement a minimal SSE chunk parser**

Create `frontend/src/core/bff-chat/stream.ts`:

```ts
import type { BffChatEvent } from "./types";

export function parseBffStreamChunk(chunk: string): BffChatEvent[] {
  return chunk
    .trim()
    .split("\n\n")
    .filter(Boolean)
    .map((block) => {
      const lines = block.split("\n");
      const event = lines.find((line) => line.startsWith("event: "))?.slice(7);
      const data = lines
        .filter((line) => line.startsWith("data: "))
        .map((line) => line.slice(6))
        .join("\n");

      return {
        type: event,
        data: JSON.parse(data),
      } as BffChatEvent;
    });
}
```

- [ ] **Step 5: Re-export the parser**

Update `frontend/src/core/bff-chat/index.ts`:

```ts
export * from "./api";
export * from "./stream";
export * from "./types";
```

- [ ] **Step 6: Run the stream parser test to verify it passes**

Run: `node src/core/bff-chat/stream.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/core/bff-chat/types.ts frontend/src/core/bff-chat/stream.ts frontend/src/core/bff-chat/stream.test.ts frontend/src/core/bff-chat/index.ts
git commit -m "feat: add bff chat stream event parser"
```

## Task 3: Drive Conversation-Oriented Chat State From BFF Events

**Files:**
- Create: `frontend/src/core/bff-chat/state.ts`
- Create: `frontend/src/core/bff-chat/state.test.ts`
- Modify: `frontend/src/core/bff-chat/types.ts`
- Modify: `frontend/src/core/bff-chat/index.ts`

- [ ] **Step 1: Write a failing state transition test**

Create `frontend/src/core/bff-chat/state.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

const { createInitialChatState, applyBffChatEvent } = await import(
  new URL("./state.ts", import.meta.url).href,
);

void test("builds a final assistant message from delta events", () => {
  let state = createInitialChatState();

  state = applyBffChatEvent(state, {
    type: "message.started",
    data: { message_id: "assistant-1" },
  });
  state = applyBffChatEvent(state, {
    type: "message.delta",
    data: { message_id: "assistant-1", delta: "Hello" },
  });
  state = applyBffChatEvent(state, {
    type: "message.completed",
    data: { message_id: "assistant-1" },
  });

  assert.equal(state.messages.length, 1);
  assert.equal(state.messages[0]?.content, "Hello");
  assert.equal(state.messages[0]?.status, "completed");
});

void test("tracks tool progress inside the active assistant message", () => {
  let state = createInitialChatState();

  state = applyBffChatEvent(state, {
    type: "message.started",
    data: { message_id: "assistant-1" },
  });
  state = applyBffChatEvent(state, {
    type: "tool.started",
    data: { tool_call_id: "tool-1", label: "Searching web" },
  });
  state = applyBffChatEvent(state, {
    type: "tool.progress",
    data: { tool_call_id: "tool-1", message: "Looking for results" },
  });

  assert.equal(state.messages[0]?.tools[0]?.status, "running");
  assert.equal(state.messages[0]?.tools[0]?.summary, "Looking for results");
});
```

- [ ] **Step 2: Run the state test to verify it fails**

Run: `node src/core/bff-chat/state.test.ts`
Expected: FAIL with `Cannot find module` for `./state.ts`

- [ ] **Step 3: Add minimal chat state types**

Append to `frontend/src/core/bff-chat/types.ts`:

```ts
export type BffChatToolState = {
  id: string;
  label: string;
  status: "running" | "completed" | "failed";
  summary: string | null;
};

export type BffChatMessageState = {
  id: string;
  role: "assistant";
  content: string;
  status: "streaming" | "completed";
  tools: BffChatToolState[];
};

export type BffChatState = {
  messages: BffChatMessageState[];
};
```

- [ ] **Step 4: Implement the minimal reducer**

Create `frontend/src/core/bff-chat/state.ts`:

```ts
import type { BffChatEvent, BffChatState } from "./types";

export function createInitialChatState(): BffChatState {
  return { messages: [] };
}

export function applyBffChatEvent(
  state: BffChatState,
  event: BffChatEvent,
): BffChatState {
  if (event.type === "message.started") {
    return {
      ...state,
      messages: state.messages.concat({
        id: event.data.message_id,
        role: "assistant",
        content: "",
        status: "streaming",
        tools: [],
      }),
    };
  }

  const lastMessage = state.messages[state.messages.length - 1];
  if (!lastMessage) {
    return state;
  }

  if (event.type === "message.delta") {
    return {
      ...state,
      messages: state.messages.map((message) =>
        message.id === event.data.message_id
          ? { ...message, content: message.content + event.data.delta }
          : message,
      ),
    };
  }

  if (event.type === "message.completed") {
    return {
      ...state,
      messages: state.messages.map((message) =>
        message.id === event.data.message_id
          ? { ...message, status: "completed" }
          : message,
      ),
    };
  }

  if (event.type === "tool.started") {
    return {
      ...state,
      messages: state.messages.map((message) =>
        message.id === lastMessage.id
          ? {
              ...message,
              tools: message.tools.concat({
                id: event.data.tool_call_id,
                label: event.data.label,
                status: "running",
                summary: null,
              }),
            }
          : message,
      ),
    };
  }

  if (event.type === "tool.progress") {
    return {
      ...state,
      messages: state.messages.map((message) =>
        message.id === lastMessage.id
          ? {
              ...message,
              tools: message.tools.map((tool) =>
                tool.id === event.data.tool_call_id
                  ? { ...tool, summary: event.data.message }
                  : tool,
              ),
            }
          : message,
      ),
    };
  }

  return state;
}
```

- [ ] **Step 5: Re-export the reducer**

Update `frontend/src/core/bff-chat/index.ts`:

```ts
export * from "./api";
export * from "./state";
export * from "./stream";
export * from "./types";
```

- [ ] **Step 6: Run the state test to verify it passes**

Run: `node src/core/bff-chat/state.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/core/bff-chat/types.ts frontend/src/core/bff-chat/state.ts frontend/src/core/bff-chat/state.test.ts frontend/src/core/bff-chat/index.ts
git commit -m "feat: add bff chat state reducer"
```

## Task 4: Add Tool Collapsible UI And Connect Existing Message Rendering

**Files:**
- Create: `frontend/src/components/workspace/messages/tool-event-card.tsx`
- Modify: `frontend/src/components/workspace/messages/message-list-item.tsx`
- Modify: `frontend/src/components/workspace/messages/index.ts`
- Modify: `frontend/src/components/workspace/streaming-indicator.tsx`

- [ ] **Step 1: Write a failing UI-facing test for tool state rendering**

Append to `frontend/src/core/bff-chat/state.test.ts`:

```ts
void test("marks tool completion and failure states", () => {
  let state = createInitialChatState();

  state = applyBffChatEvent(state, {
    type: "message.started",
    data: { message_id: "assistant-1" },
  });
  state = applyBffChatEvent(state, {
    type: "tool.started",
    data: { tool_call_id: "tool-1", label: "Searching web" },
  });
  state = applyBffChatEvent(state, {
    type: "tool.failed",
    data: { tool_call_id: "tool-1", message: "Search unavailable" },
  });

  assert.equal(state.messages[0]?.tools[0]?.status, "failed");
  assert.equal(state.messages[0]?.tools[0]?.summary, "Search unavailable");
});
```

- [ ] **Step 2: Run the state test to verify it fails**

Run: `node src/core/bff-chat/state.test.ts`
Expected: FAIL because `tool.failed` is not handled

- [ ] **Step 3: Extend the reducer for completed and failed tools**

Update `frontend/src/core/bff-chat/state.ts` by adding:

```ts
  if (event.type === "tool.completed") {
    return {
      ...state,
      messages: state.messages.map((message) =>
        message.id === lastMessage.id
          ? {
              ...message,
              tools: message.tools.map((tool) =>
                tool.id === event.data.tool_call_id
                  ? { ...tool, status: "completed" }
                  : tool,
              ),
            }
          : message,
      ),
    };
  }

  if (event.type === "tool.failed") {
    return {
      ...state,
      messages: state.messages.map((message) =>
        message.id === lastMessage.id
          ? {
              ...message,
              tools: message.tools.map((tool) =>
                tool.id === event.data.tool_call_id
                  ? {
                      ...tool,
                      status: "failed",
                      summary: event.data.message,
                    }
                  : tool,
              ),
            }
          : message,
      ),
    };
  }
```

- [ ] **Step 4: Add a collapsible tool card**

Create `frontend/src/components/workspace/messages/tool-event-card.tsx`:

```tsx
"use client";

import * as Collapsible from "@radix-ui/react-collapsible";

import type { BffChatToolState } from "@/core/bff-chat";

type ToolEventCardProps = {
  tool: BffChatToolState;
};

export function ToolEventCard({ tool }: ToolEventCardProps) {
  return (
    <Collapsible.Root
      className="bg-muted/60 border-border mt-2 rounded-lg border"
      defaultOpen={tool.status === "running"}
    >
      <Collapsible.Trigger className="flex w-full items-center justify-between px-3 py-2 text-left text-sm">
        <span>{tool.label}</span>
        <span className="text-muted-foreground text-xs">{tool.status}</span>
      </Collapsible.Trigger>
      <Collapsible.Content className="border-t px-3 py-2 text-xs">
        {tool.summary ?? "Working..."}
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
```

- [ ] **Step 5: Render tool cards inside message items**

Update `frontend/src/components/workspace/messages/message-list-item.tsx` to render:

```tsx
import { ToolEventCard } from "./tool-event-card";
```

and within the assistant message content area:

```tsx
{message.tools?.map((tool) => (
  <ToolEventCard key={tool.id} tool={tool} />
))}
```

Update `frontend/src/components/workspace/messages/index.ts`:

```ts
export * from "./tool-event-card";
```

- [ ] **Step 6: Run the state test to verify it passes**

Run: `node src/core/bff-chat/state.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/core/bff-chat/state.ts frontend/src/core/bff-chat/state.test.ts frontend/src/components/workspace/messages/tool-event-card.tsx frontend/src/components/workspace/messages/message-list-item.tsx frontend/src/components/workspace/messages/index.ts
git commit -m "feat: add collapsible tool event cards"
```

## Task 5: Switch Main Frontend Chat Route To Conversation Semantics

**Files:**
- Modify: `frontend/src/app/workspace/chats/[thread_id]/page.tsx`
- Modify: `frontend/src/app/workspace/chats/[thread_id]/layout.tsx`
- Modify: `frontend/src/app/workspace/chats/page.tsx`
- Modify: `frontend/src/components/workspace/chats/use-thread-chat.ts`
- Modify: `frontend/src/components/workspace/chats/chat-box.tsx`
- Modify: `frontend/src/core/threads/types.ts`
- Modify: `frontend/src/core/threads/hooks.ts`
- Modify: `frontend/src/core/threads/index.ts`
- Modify: `frontend/src/core/threads/utils.ts`
- Modify: `frontend/src/components/workspace/workspace-nav-chat-list.tsx`
- Modify: `frontend/src/components/workspace/recent-chat-list.tsx`
- Modify: `frontend/src/components/workspace/thread-title.tsx`

- [ ] **Step 1: Write a failing route-focused frontend test**

Append to `frontend/src/core/bff-chat/api.test.ts`:

```ts
void test("uses conversation_id as the public chat identifier", async () => {
  const result = await createConversation(async () =>
    new Response(
      JSON.stringify({
        id: "conversation-123",
        title: "New chat",
        created_at: "2026-04-10T00:00:00Z",
        updated_at: "2026-04-10T00:00:00Z",
      }),
      { status: 201, headers: { "content-type": "application/json" } },
    ),
  );

  assert.equal(result.id, "conversation-123");
});
```

- [ ] **Step 2: Run the API test to verify it passes before route migration**

Run: `node src/core/bff-chat/api.test.ts`
Expected: PASS

- [ ] **Step 3: Rename route semantics in the page layer**

Update `frontend/src/app/workspace/chats/[thread_id]/page.tsx` and related code to read route params as `conversation_id` even before renaming the folder on disk. Use:

```tsx
type ChatPageProps = {
  params: Promise<{ thread_id: string }>;
};

export default async function WorkspaceChatPage({ params }: ChatPageProps) {
  const { thread_id: conversationId } = await params;

  return <ChatBox conversationId={conversationId} />;
}
```

Update `frontend/src/components/workspace/chats/chat-box.tsx`:

```tsx
type ChatBoxProps = {
  conversationId: string;
};
```

Update `frontend/src/core/threads/types.ts` to prefer `conversationId` naming in public frontend state.

- [ ] **Step 4: Replace route creation logic to call the BFF**

Update `frontend/src/app/workspace/chats/page.tsx` to create a BFF conversation and redirect:

```tsx
import { redirect } from "next/navigation";

import { createConversation } from "@/core/bff-chat";

export default async function WorkspaceChatsPage() {
  const conversation = await createConversation();
  redirect(`/workspace/chats/${conversation.id}`);
}
```

- [ ] **Step 5: Adapt thread hooks to conversation state**

Update `frontend/src/components/workspace/chats/use-thread-chat.ts` and `frontend/src/core/threads/hooks.ts` to:

- accept `conversationId`
- stop assuming runtime-native thread identifiers in the primary path
- drive assistant updates through `applyBffChatEvent`

Keep the file focused on state orchestration, not raw BFF transport parsing.

- [ ] **Step 6: Run lint and typecheck on the route migration**

Run: `cd frontend && pnpm lint && pnpm typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/workspace/chats/[thread_id]/page.tsx frontend/src/app/workspace/chats/page.tsx frontend/src/components/workspace/chats/chat-box.tsx frontend/src/components/workspace/chats/use-thread-chat.ts frontend/src/core/threads/types.ts frontend/src/core/threads/hooks.ts frontend/src/core/threads/index.ts frontend/src/core/threads/utils.ts frontend/src/components/workspace/workspace-nav-chat-list.tsx frontend/src/components/workspace/recent-chat-list.tsx frontend/src/components/workspace/thread-title.tsx
git commit -m "feat: migrate main chat route to bff conversation ids"
```

## Task 6: Add Frontend Streaming Submission Through BFF

**Files:**
- Modify: `frontend/src/core/bff-chat/api.ts`
- Modify: `frontend/src/core/bff-chat/stream.ts`
- Modify: `frontend/src/components/workspace/chats/use-thread-chat.ts`
- Modify: `frontend/src/components/workspace/input-box.tsx`
- Modify: `frontend/src/components/workspace/chats/chat-box.tsx`

- [ ] **Step 1: Write a failing stream submission test**

Append to `frontend/src/core/bff-chat/api.test.ts`:

```ts
void test("posts a user message to the BFF stream endpoint", async () => {
  const { streamMessage } = await import(new URL("./api.ts", import.meta.url).href);

  let capturedBody = "";
  await streamMessage(
    {
      conversationId: "conversation-1",
      content: "Hello",
    },
    async (input, init) => {
      assert.equal(input, "/api/bff/conversations/conversation-1/messages/stream");
      assert.equal(init?.method, "POST");
      capturedBody = String(init?.body);

      return new Response("event: message.completed\\ndata: {\"message_id\":\"assistant-1\"}\\n\\n", {
        status: 200,
      });
    },
  );

  assert.match(capturedBody, /"content":"Hello"/);
});
```

- [ ] **Step 2: Run the API test to verify it fails**

Run: `node src/core/bff-chat/api.test.ts`
Expected: FAIL because `streamMessage` is undefined

- [ ] **Step 3: Add the stream request helper**

Update `frontend/src/core/bff-chat/api.ts`:

```ts
type StreamMessageInput = {
  conversationId: string;
  content: string;
};

export async function streamMessage(
  input: StreamMessageInput,
  fetchImpl: FetchLike = fetch,
) {
  const response = await fetchImpl(
    `/api/bff/conversations/${input.conversationId}/messages/stream`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        content: input.content,
      }),
    },
  );

  if (!response.ok || !response.body) {
    throw new Error("Failed to stream message");
  }

  return response.body;
}
```

- [ ] **Step 4: Drive the stream reader from chat state**

Update `frontend/src/components/workspace/chats/use-thread-chat.ts` to:

- call `streamMessage()`
- read `response.body` via `TextDecoder`
- pass parsed chunks through `parseBffStreamChunk()`
- reduce them with `applyBffChatEvent()`

Keep optimistic user message insertion separate from stream parsing.

- [ ] **Step 5: Run the API test to verify it passes**

Run: `node src/core/bff-chat/api.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/core/bff-chat/api.ts frontend/src/components/workspace/chats/use-thread-chat.ts frontend/src/components/workspace/input-box.tsx frontend/src/components/workspace/chats/chat-box.tsx
git commit -m "feat: stream chat messages through bff"
```

## Task 7: Normalize BFF Stream Events On The Backend

**Files:**
- Create: `bff/tests/api/test_bff_chat_stream_contract.py`
- Modify: `bff/app/schemas/conversation.py`
- Modify: `bff/app/api/routes/conversations.py`
- Modify: `bff/app/services/conversation_service.py`
- Modify: `bff/app/sse/proxy.py`
- Modify: `bff/tests/api/test_conversation_routes.py`
- Modify: `bff/tests/api/test_stream_routes.py`

- [ ] **Step 1: Write a failing BFF contract test**

Create `bff/tests/api/test_bff_chat_stream_contract.py`:

```python
from app.sse.proxy import normalize_stream_event


def test_normalize_stream_event_maps_tool_and_message_events():
    assert normalize_stream_event(
        {"event": "tool_start", "data": {"tool_call_id": "tool-1", "label": "Searching web"}}
    ) == {
        "event": "tool.started",
        "data": {"tool_call_id": "tool-1", "label": "Searching web"},
    }

    assert normalize_stream_event(
        {"event": "message_delta", "data": {"message_id": "assistant-1", "delta": "Hello"}}
    ) == {
        "event": "message.delta",
        "data": {"message_id": "assistant-1", "delta": "Hello"},
    }
```

- [ ] **Step 2: Run the BFF contract test to verify it fails**

Run: `cd bff && uv run pytest tests/api/test_bff_chat_stream_contract.py -q`
Expected: FAIL because `normalize_stream_event` is undefined or incomplete

- [ ] **Step 3: Add the normalized event mapper**

Update `bff/app/sse/proxy.py`:

```python
def normalize_stream_event(event: dict) -> dict:
    mapping = {
        "message_start": "message.started",
        "message_delta": "message.delta",
        "message_complete": "message.completed",
        "tool_start": "tool.started",
        "tool_progress": "tool.progress",
        "tool_complete": "tool.completed",
        "tool_error": "tool.failed",
        "run_error": "run.failed",
    }

    return {
        "event": mapping.get(event["event"], event["event"]),
        "data": event["data"],
    }
```

- [ ] **Step 4: Apply normalization in the stream route**

Update `bff/app/api/routes/conversations.py` and `bff/app/services/conversation_service.py` so the stream route:

- authenticates and validates ownership as it already does
- reads downstream stream events
- converts them with `normalize_stream_event()`
- emits only normalized frontend events

- [ ] **Step 5: Extend route tests**

Add one route-level test in `bff/tests/api/test_stream_routes.py` asserting the stream output contains:

```python
b"event: message.delta"
b"event: tool.started"
```

- [ ] **Step 6: Run backend tests to verify they pass**

Run: `cd bff && uv run pytest tests/api/test_bff_chat_stream_contract.py tests/api/test_stream_routes.py tests/api/test_conversation_routes.py -q`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add bff/app/sse/proxy.py bff/app/api/routes/conversations.py bff/app/services/conversation_service.py bff/tests/api/test_bff_chat_stream_contract.py bff/tests/api/test_stream_routes.py bff/tests/api/test_conversation_routes.py
git commit -m "feat: normalize bff chat stream events"
```

## Task 8: Add Browser-Level End-To-End Coverage And Docs

**Files:**
- Create: `frontend/tests/e2e/bff-chat.spec.ts`
- Modify: `frontend/playwright.config.ts`
- Modify: `frontend/package.json`
- Modify: `frontend/README.md`
- Modify: `frontend/.env.example`

- [ ] **Step 1: Write a failing E2E spec**

Create `frontend/tests/e2e/bff-chat.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("creates a conversation and streams an assistant reply through the BFF", async ({
  page,
}) => {
  await page.route("**/api/bff/conversations", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          id: "conversation-1",
          title: "New chat",
          created_at: "2026-04-10T00:00:00Z",
          updated_at: "2026-04-10T00:00:00Z",
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  await page.route("**/api/bff/conversations/conversation-1/messages/stream", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: [
        "event: message.started",
        "data: {\"message_id\":\"assistant-1\"}",
        "",
        "event: tool.started",
        "data: {\"tool_call_id\":\"tool-1\",\"label\":\"Searching web\"}",
        "",
        "event: message.delta",
        "data: {\"message_id\":\"assistant-1\",\"delta\":\"Hello from BFF\"}",
        "",
        "event: message.completed",
        "data: {\"message_id\":\"assistant-1\"}",
        "",
      ].join("\\n"),
    });
  });

  await page.goto("/workspace/chats");
  await page.getByRole("textbox").fill("Hello");
  await page.getByRole("button", { name: /send/i }).click();

  await expect(page.getByText("Hello from BFF")).toBeVisible();
  await expect(page.getByText("Searching web")).toBeVisible();
});
```

- [ ] **Step 2: Run the E2E spec to verify it fails**

Run: `cd frontend && PLAYWRIGHT_USE_EXISTING_SERVER=1 BETTER_AUTH_SECRET=test-secret NEXT_PUBLIC_AUTH_E2E_MOCK=1 pnpm exec playwright test tests/e2e/bff-chat.spec.ts --project=chromium`
Expected: FAIL until the main chat route is migrated

- [ ] **Step 3: Add Playwright script wiring**

Update `frontend/package.json`:

```json
"test:e2e:bff-chat": "playwright test tests/e2e/bff-chat.spec.ts --project=chromium"
```

- [ ] **Step 4: Document the new chat path**

Update `frontend/README.md` and `frontend/.env.example` to describe:

- BFF-owned chat route semantics
- `conversation_id` replacing runtime thread semantics
- the auth + BFF chat E2E scripts

- [ ] **Step 5: Run the E2E spec to verify it passes**

Run: `cd frontend && PLAYWRIGHT_USE_EXISTING_SERVER=1 BETTER_AUTH_SECRET=test-secret NEXT_PUBLIC_AUTH_E2E_MOCK=1 pnpm test:e2e:bff-chat`
Expected: PASS

- [ ] **Step 6: Run the final verification suite**

Run:

```bash
cd frontend && pnpm lint && pnpm typecheck
cd ../bff && uv run pytest tests/api/test_bff_chat_stream_contract.py tests/api/test_stream_routes.py tests/api/test_conversation_routes.py -q
cd ../frontend && PLAYWRIGHT_USE_EXISTING_SERVER=1 BETTER_AUTH_SECRET=test-secret NEXT_PUBLIC_AUTH_E2E_MOCK=1 pnpm test:e2e:auth
cd ../frontend && PLAYWRIGHT_USE_EXISTING_SERVER=1 BETTER_AUTH_SECRET=test-secret NEXT_PUBLIC_AUTH_E2E_MOCK=1 pnpm test:e2e:bff-chat
cd ../frontend && BETTER_AUTH_SECRET=test-secret pnpm build
```

Expected: all commands pass

- [ ] **Step 7: Commit**

```bash
git add frontend/tests/e2e/bff-chat.spec.ts frontend/package.json frontend/README.md frontend/.env.example frontend/playwright.config.ts
git commit -m "test: cover bff chat stream end to end"
```
