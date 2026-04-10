import assert from "node:assert/strict";
import test from "node:test";

import type { AgentThreadState } from "@/core/threads";

const { mergeConversationMetadata, toConversationThreadState } = await import(
  new URL("./values.ts", import.meta.url).href,
);

void test("builds a thread state from BFF conversation detail", () => {
  const state = toConversationThreadState({
    id: "conversation-1",
    title: "Top level title",
    created_at: "2026-04-10T00:00:00Z",
    updated_at: "2026-04-10T00:00:01Z",
    status: "active",
    values: {
      title: "Conversation title",
      messages: [{ id: "ai-1", type: "ai", content: "Hello" }],
      artifacts: ["artifact-1"],
      todos: [{ id: "todo-1", title: "Check output", done: false }],
    },
  });

  assert.equal(state.title, "Conversation title");
  assert.deepEqual(state.messages, [{ id: "ai-1", type: "ai", content: "Hello" }]);
  assert.deepEqual(state.artifacts, ["artifact-1"]);
  assert.deepEqual(state.todos, [{ id: "todo-1", title: "Check output", done: false }]);
});

void test("merges refreshed conversation metadata without replacing current messages", () => {
  const current: AgentThreadState = {
    title: "",
    messages: [
      { id: "human-1", type: "human", content: "hello" },
      { id: "ai-1", type: "ai", content: "world" },
    ],
    artifacts: [],
    todos: [],
  };

  const next = mergeConversationMetadata(current, {
    id: "conversation-1",
    title: "Fallback title",
    created_at: "2026-04-10T00:00:00Z",
    updated_at: "2026-04-10T00:00:01Z",
    status: "active",
    values: {
      title: "Merged title",
      artifacts: ["artifact-2"],
      todos: [{ id: "todo-2", title: "Merged todo", done: true }],
    },
  });

  assert.equal(next.title, "Merged title");
  assert.deepEqual(next.messages, current.messages);
  assert.deepEqual(next.artifacts, ["artifact-2"]);
  assert.deepEqual(next.todos, [{ id: "todo-2", title: "Merged todo", done: true }]);
});
