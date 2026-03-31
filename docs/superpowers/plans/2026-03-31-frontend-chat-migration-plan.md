# Frontend Chat Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the frontend from direct LangGraph SDK runtime integration to the new Gateway BFF conversation/chat endpoints while keeping the existing page structure.

**Architecture:** Keep the current chat pages and components, but replace the API client and thread hooks with a fetch-based BFF layer. In Phase 1, frontend `threadId` continues to map to backend `conversation_id`, and uploads remain thread-based.

**Tech Stack:** Next.js, React 19, TanStack Query, `ai` package, fetch/SSE, existing chat UI components

---

## File Structure

### Existing files to modify

- `frontend/src/core/api/api-client.ts`
  Remove direct `LangGraphClient` construction and replace it with a BFF-oriented client/helper layer.
- `frontend/src/core/threads/hooks.ts`
  Replace `useStream` internals with BFF conversation/chat hooks.
- `frontend/src/core/threads/types.ts`
  Relax types so frontend runtime no longer depends on LangGraph thread objects.
- `frontend/src/core/config/index.ts`
  Make `NEXT_PUBLIC_BACKEND_BASE_URL` the primary dependency.
- `frontend/src/core/uploads/api.ts`
  Keep thread-based uploads, but ensure it still works with the migrated flow.

### New files to create

- `frontend/src/core/chat/api.ts`
  Fetch helpers for `/api/conversations` and `/api/chat/stream`.
- `frontend/src/core/chat/transport.ts`
  Small wrapper that translates business SSE into the shape consumed by the frontend hook layer.
- `frontend/src/core/chat/types.ts`
  Conversation/chat-specific response and stream event types.

## Task 1: Build Frontend BFF API Layer

**Files:**
- Create: `frontend/src/core/chat/types.ts`
- Create: `frontend/src/core/chat/api.ts`
- Modify: `frontend/src/core/config/index.ts`
- Test manually via browser/network panel in dev

- [ ] **Step 1: Write the new BFF-facing types**

```ts
export interface ConversationSummary {
  conversation_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatStreamRequest {
  conversation_id?: string;
  message: string;
  context?: Record<string, unknown>;
}

export interface ChatStreamEvent {
  event:
    | "conversation.created"
    | "message.delta"
    | "message.completed"
    | "run.completed"
    | "error";
  data: Record<string, unknown>;
}
```

- [ ] **Step 2: Add fetch helpers for conversations and chat stream**

```ts
import { getBackendBaseURL } from "../config";
import type {
  ChatStreamRequest,
  ConversationSummary,
} from "./types";

export async function listConversations(): Promise<ConversationSummary[]> {
  const response = await fetch(`${getBackendBaseURL()}/api/conversations`);
  if (!response.ok) {
    throw new Error("Failed to load conversations");
  }
  return response.json();
}

export async function createConversation(title = ""): Promise<ConversationSummary> {
  const response = await fetch(`${getBackendBaseURL()}/api/conversations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  if (!response.ok) {
    throw new Error("Failed to create conversation");
  }
  return response.json();
}

export async function deleteConversation(conversationId: string): Promise<void> {
  const response = await fetch(
    `${getBackendBaseURL()}/api/conversations/${encodeURIComponent(conversationId)}`,
    { method: "DELETE" },
  );
  if (!response.ok) {
    throw new Error("Failed to delete conversation");
  }
}

export async function openChatStream(body: ChatStreamRequest): Promise<Response> {
  const response = await fetch(`${getBackendBaseURL()}/api/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error("Failed to open chat stream");
  }
  return response;
}
```

- [ ] **Step 3: Make backend URL the primary config dependency**

```ts
export function getBackendBaseURL() {
  if (env.NEXT_PUBLIC_BACKEND_BASE_URL) {
    return new URL(env.NEXT_PUBLIC_BACKEND_BASE_URL, getBaseOrigin())
      .toString()
      .replace(/\/+$/, "");
  }
  return "";
}
```

- [ ] **Step 4: Commit Task 1**

```bash
git add frontend/src/core/chat/types.ts \
  frontend/src/core/chat/api.ts \
  frontend/src/core/config/index.ts
git commit -m "feat: add frontend chat bff api layer"
```

## Task 2: Replace Thread Hooks with BFF-Backed Hooks

**Files:**
- Create: `frontend/src/core/chat/transport.ts`
- Modify: `frontend/src/core/threads/hooks.ts`
- Modify: `frontend/src/core/threads/types.ts`

- [ ] **Step 1: Add a minimal SSE reader**

```ts
import type { ChatStreamEvent } from "./types";

export async function* readChatEvents(response: Response): AsyncGenerator<ChatStreamEvent> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Streaming body is missing");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      const eventLine = frame.split("\n").find((line) => line.startsWith("event: "));
      const dataLine = frame.split("\n").find((line) => line.startsWith("data: "));
      if (!eventLine || !dataLine) continue;

      yield {
        event: eventLine.replace("event: ", "") as ChatStreamEvent["event"],
        data: JSON.parse(dataLine.replace("data: ", "")),
      };
    }
  }
}
```

- [ ] **Step 2: Rework `useThreads()` to query conversations**

```ts
export function useThreads() {
  return useQuery({
    queryKey: ["threads", "search"],
    queryFn: async () => {
      const conversations = await listConversations();
      return conversations.map((conversation) => ({
        thread_id: conversation.conversation_id,
        updated_at: conversation.updated_at,
        created_at: conversation.created_at,
        values: { title: conversation.title, messages: [], artifacts: [] },
        metadata: {},
        status: "idle",
      }));
    },
    refetchOnWindowFocus: false,
  });
}
```

- [ ] **Step 3: Rework `useDeleteThread()` to delete conversations**

```ts
export function useDeleteThread() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ threadId }: { threadId: string }) => {
      await deleteConversation(threadId);
    },
    onSuccess(_, { threadId }) {
      queryClient.setQueriesData(
        { queryKey: ["threads", "search"], exact: false },
        (oldData: Array<AgentThread> | undefined) =>
          oldData?.filter((thread) => thread.thread_id !== threadId),
      );
    },
  });
}
```

- [ ] **Step 4: Rework `useThreadStream()` to call `/api/chat/stream`**

```ts
const response = await openChatStream({
  conversation_id: threadId,
  message: text,
  context: {
    ...extraContext,
    ...context,
  },
});

for await (const event of readChatEvents(response)) {
  if (event.event === "conversation.created") {
    const createdId = String(event.data.conversation_id);
    threadIdRef.current = createdId;
    setOnStreamThreadId(createdId);
    handleStreamStart(createdId);
  }
}
```

- [ ] **Step 5: Keep the external hook surface stable**

```ts
return [mergedThreadLikeObject, sendMessage, isUploading] as const;
```

- [ ] **Step 6: Commit Task 2**

```bash
git add frontend/src/core/chat/transport.ts \
  frontend/src/core/threads/hooks.ts \
  frontend/src/core/threads/types.ts
git commit -m "feat: migrate frontend thread hooks to bff chat api"
```

## Task 3: Reconnect Existing Pages and Preserve Upload Flow

**Files:**
- Modify: `frontend/src/core/api/api-client.ts`
- Modify: `frontend/src/core/uploads/api.ts`
- Verify pages:
  - `frontend/src/app/workspace/chats/page.tsx`
  - `frontend/src/app/workspace/chats/[thread_id]/page.tsx`

- [ ] **Step 1: Remove `LangGraphClient` runtime usage**

```ts
export function getAPIClient() {
  throw new Error("LangGraph client is no longer used by the frontend BFF flow");
}
```

- [ ] **Step 2: Keep uploads on thread-based backend endpoints**

```ts
export async function uploadFiles(threadId: string, files: File[]) {
  const formData = new FormData();
  for (const file of files) formData.append("files", file);

  const response = await fetch(
    `${getBackendBaseURL()}/api/threads/${threadId}/uploads`,
    { method: "POST", body: formData },
  );

  if (!response.ok) {
    throw new Error(await readErrorDetail(response, "Upload failed"));
  }

  return response.json();
}
```

- [ ] **Step 3: Manual verification in the browser**

Run:

```bash
pnpm dev
```

Verify:

- chats list loads through `/api/conversations`
- deleting a chat calls `/api/conversations/{id}`
- sending a message calls `/api/chat/stream`
- creating a new conversation via first message updates the URL
- uploads still work after a conversation exists

- [ ] **Step 4: Commit Task 3**

```bash
git add frontend/src/core/api/api-client.ts \
  frontend/src/core/uploads/api.ts \
  frontend/src/core/threads/hooks.ts \
  frontend/src/core/config/index.ts
git commit -m "feat: switch frontend to gateway chat bff"
```

## Self-Review Notes

- Spec coverage:
  - preserve UI structure: covered by Task 2 and Task 3
  - remove runtime LangGraph dependency: covered by Task 1, Task 2, Task 3
  - use `/api/conversations` and `/api/chat/stream`: covered by Task 1 and Task 2
  - keep uploads thread-based: covered by Task 3
- Placeholder scan:
  - no `TODO`/`TBD` placeholders remain in plan steps
- Type consistency:
  - frontend still uses `threadId` naming
  - backend-facing identifier consistently maps to `conversation_id`
