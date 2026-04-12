import assert from "node:assert/strict";
import test from "node:test";

const { createHumanMessage, toThreadMessages } = await import(
  new URL("./messages.ts", import.meta.url).href,
);
const { createInitialChatState, applyBffChatEvent } = await import(
  new URL("./state.ts", import.meta.url).href,
);

void test("converts tool lifecycle state into ai and tool messages", () => {
  let state = createInitialChatState();
  state = applyBffChatEvent(state, {
    type: "message.started",
    data: { message_id: "assistant-1" },
  });
  state = applyBffChatEvent(state, {
    type: "tool.started",
    data: {
      tool_call_id: "tool-1",
      label: "Searching web",
      name: "web_search",
      args: { query: "weather" },
    },
  });
  state = applyBffChatEvent(state, {
    type: "tool.progress",
    data: { tool_call_id: "tool-1", message: "Looking for sources" },
  });
  state = applyBffChatEvent(state, {
    type: "message.delta",
    data: { message_id: "assistant-1", delta: "Hello" },
  });

  const messages = toThreadMessages(state, [createHumanMessage("Hi")]);

  assert.equal(messages.length, 4);
  assert.equal(messages[0]?.type, "human");
  assert.equal(messages[1]?.type, "ai");
  assert.equal(messages[1]?.tool_calls?.[0]?.name, "web_search");
  assert.deepEqual(messages[1]?.tool_calls?.[0]?.args, {
    query: "weather",
    description: "Searching web",
  });
  assert.equal(messages[2]?.type, "tool");
  assert.equal(messages[3]?.type, "ai");
  assert.equal(messages[2]?.content, "Looking for sources");
});

void test("emits a completed assistant message even when content is empty", () => {
  let state = createInitialChatState();
  state = applyBffChatEvent(state, {
    type: "message.started",
    data: { message_id: "assistant-1" },
  });
  state = applyBffChatEvent(state, {
    type: "message.completed",
    data: { message_id: "assistant-1" },
  });

  const messages = toThreadMessages(state, []);

  assert.equal(messages.length, 1);
  assert.equal(messages[0]?.type, "ai");
  assert.equal(messages[0]?.id, "assistant-1");
});

void test("emits an in-progress assistant message during streaming", () => {
  let state = createInitialChatState();
  state = applyBffChatEvent(state, {
    type: "message.started",
    data: { message_id: "assistant-2" },
  });

  const messages = toThreadMessages(state, []);

  assert.equal(messages.length, 1);
  assert.equal(messages[0]?.type, "ai");
  assert.equal(messages[0]?.id, "assistant-2");
  assert.equal(messages[0]?.content, "");
});

void test("keeps an assistant placeholder message during tool-driven streaming", () => {
  let state = createInitialChatState();
  state = applyBffChatEvent(state, {
    type: "message.started",
    data: { message_id: "assistant-3" },
  });
  state = applyBffChatEvent(state, {
    type: "tool.started",
    data: {
      tool_call_id: "tool-3",
      label: "web_search",
      name: "web_search",
      args: { query: "weather" },
    },
  });

  const messages = toThreadMessages(state, []);

  assert.equal(messages.length, 3);
  assert.equal(messages[0]?.type, "ai");
  assert.equal(messages[0]?.id, "assistant-3-tools");
  assert.equal(messages[1]?.type, "tool");
  assert.equal(messages[1]?.content, "Running");
  assert.equal(messages[2]?.type, "ai");
  assert.equal(messages[2]?.id, "assistant-3");
});

void test("preserves assistant reasoning on the synthesized langgraph messages", () => {
  let state = createInitialChatState();
  state = applyBffChatEvent(state, {
    type: "message.started",
    data: { message_id: "assistant-4" },
  });
  state = applyBffChatEvent(state, {
    type: "reasoning.delta",
    data: { message_id: "assistant-4", delta: "Think first." },
  });
  state = applyBffChatEvent(state, {
    type: "message.delta",
    data: { message_id: "assistant-4", delta: "Final answer" },
  });

  const messages = toThreadMessages(state, []);

  assert.equal(messages.length, 1);
  assert.equal(messages[0]?.type, "ai");
  assert.equal(messages[0]?.content, "Final answer");
  assert.equal(
    messages[0]?.additional_kwargs?.reasoning_content,
    "Think first.",
  );
});

void test("keeps post-tool reasoning after the tool lifecycle in synthesized messages", () => {
  let state = createInitialChatState();
  state = applyBffChatEvent(state, {
    type: "message.started",
    data: { message_id: "assistant-5" },
  });
  state = applyBffChatEvent(state, {
    type: "reasoning.delta",
    data: { message_id: "assistant-5", delta: "Need the Chengdu forecast." },
  });
  state = applyBffChatEvent(state, {
    type: "tool.started",
    data: {
      tool_call_id: "tool-5",
      label: "查看网页",
      name: "web_fetch",
      args: { url: "https://example.com/weather" },
    },
  });
  state = applyBffChatEvent(state, {
    type: "tool.progress",
    data: { tool_call_id: "tool-5", message: "成都市天气预报24小时" },
  });
  state = applyBffChatEvent(state, {
    type: "reasoning.delta",
    data: {
      message_id: "assistant-5",
      delta: "已经拿到结果，现在整理成最终回答。",
    },
  });

  const messages = toThreadMessages(state, []);

  assert.equal(messages.length, 4);
  assert.equal(
    messages[0]?.additional_kwargs?.reasoning_content,
    "Need the Chengdu forecast.",
  );
  assert.equal(messages[1]?.tool_calls?.[0]?.name, "web_fetch");
  assert.equal(messages[2]?.type, "tool");
  assert.equal(
    messages[3]?.additional_kwargs?.reasoning_content,
    "已经拿到结果，现在整理成最终回答。",
  );
});
