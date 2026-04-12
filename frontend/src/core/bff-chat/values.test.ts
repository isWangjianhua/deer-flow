import assert from "node:assert/strict";
import test from "node:test";

import type { AgentThreadState } from "@/core/threads";

const {
  mergeConversationMetadata,
  mergeConversationState,
  toConversationThreadState,
} = await import(
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

void test("replaces streamed synthetic messages with the final BFF conversation state", () => {
  const current: AgentThreadState = {
    title: "Streaming title",
    messages: [
      {
        id: "assistant-1-reasoning-after-tools",
        type: "ai",
        content: "",
        additional_kwargs: {
          reasoning_content:
            "根据获取的西安天气数据，整理明天（4 月 13 日）的天气预报信息。",
        },
      },
      {
        id: "assistant-1",
        type: "ai",
        content: "西安明天晴转多云。",
      },
    ],
    artifacts: ["artifact-streaming"],
    todos: [],
  };

  const next = mergeConversationState(current, {
    id: "conversation-1",
    title: "Final title",
    created_at: "2026-04-10T00:00:00Z",
    updated_at: "2026-04-10T00:00:01Z",
    status: "active",
    values: {
      title: "Final title",
      messages: [
        { id: "human-1", type: "human", content: "西安明天天气呢" },
        {
          id: "ai-final-1",
          type: "ai",
          content: "西安明天晴转多云。",
          additional_kwargs: {
            reasoning_content:
              "用户询问西安明天的天气，我需要使用之前成功的天气查询网站来获取西安的天气预报信息。",
          },
        },
      ],
      artifacts: ["artifact-final"],
      todos: [{ id: "todo-3", title: "Final todo", done: false }],
    },
  });

  assert.equal(next.title, "Final title");
  assert.deepEqual(next.messages, [
    { id: "human-1", type: "human", content: "西安明天天气呢" },
    {
      id: "ai-final-1",
      type: "ai",
      content: "西安明天晴转多云。",
      additional_kwargs: {
        reasoning_content:
          "用户询问西安明天的天气，我需要使用之前成功的天气查询网站来获取西安的天气预报信息。",
      },
    },
  ]);
  assert.deepEqual(next.artifacts, ["artifact-final"]);
  assert.deepEqual(next.todos, [{ id: "todo-3", title: "Final todo", done: false }]);
});
