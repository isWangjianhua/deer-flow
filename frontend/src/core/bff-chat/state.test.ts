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
    data: {
      tool_call_id: "tool-1",
      label: "Searching web",
      name: "web_search",
      args: { query: "weather" },
    },
  });
  state = applyBffChatEvent(state, {
    type: "tool.progress",
    data: { tool_call_id: "tool-1", message: "Looking for results" },
  });

  assert.equal(state.messages[0]?.tools[0]?.status, "running");
  assert.equal(state.messages[0]?.tools[0]?.summary, "Looking for results");
  assert.equal(state.messages[0]?.tools[0]?.name, "web_search");
  assert.deepEqual(state.messages[0]?.tools[0]?.args, { query: "weather" });
});

void test("marks tool completion and failure states", () => {
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
    type: "tool.failed",
    data: { tool_call_id: "tool-1", message: "Search unavailable" },
  });

  assert.equal(state.messages[0]?.tools[0]?.status, "failed");
  assert.equal(state.messages[0]?.tools[0]?.summary, "Search unavailable");
});

void test("accumulates reasoning deltas on the active assistant message", () => {
  let state = createInitialChatState();

  state = applyBffChatEvent(state, {
    type: "message.started",
    data: { message_id: "assistant-1" },
  });
  state = applyBffChatEvent(state, {
    type: "reasoning.delta",
    data: { message_id: "assistant-1", delta: "First inspect." },
  });
  state = applyBffChatEvent(state, {
    type: "reasoning.delta",
    data: { message_id: "assistant-1", delta: " Then answer." },
  });

  assert.equal(
    state.messages[0]?.reasoning_before_tools,
    "First inspect. Then answer.",
  );
});

void test("routes reasoning that arrives after tool start into the post-tool bucket", () => {
  let state = createInitialChatState();

  state = applyBffChatEvent(state, {
    type: "message.started",
    data: { message_id: "assistant-2" },
  });
  state = applyBffChatEvent(state, {
    type: "reasoning.delta",
    data: { message_id: "assistant-2", delta: "Plan the next step." },
  });
  state = applyBffChatEvent(state, {
    type: "tool.started",
    data: {
      tool_call_id: "tool-2",
      label: "Search web",
      name: "web_search",
      args: { query: "Chengdu weather" },
    },
  });
  state = applyBffChatEvent(state, {
    type: "reasoning.delta",
    data: { message_id: "assistant-2", delta: "Now summarize the result." },
  });

  assert.equal(state.messages[0]?.reasoning_before_tools, "Plan the next step.");
  assert.equal(
    state.messages[0]?.reasoning_after_tools,
    "Now summarize the result.",
  );
});

void test("strips a repeated pre-tool reasoning suffix from post-tool reasoning snapshots", () => {
  let state = createInitialChatState();

  state = applyBffChatEvent(state, {
    type: "message.started",
    data: { message_id: "assistant-3" },
  });
  state = applyBffChatEvent(state, {
    type: "reasoning.delta",
    data: {
      message_id: "assistant-3",
      delta:
        "根据获取的西安天气数据，整理明天（4 月 13 日）的天气预报信息，并可以提供与之前查询的四个城市的对比汇总。",
    },
  });
  state = applyBffChatEvent(state, {
    type: "tool.started",
    data: {
      tool_call_id: "tool-3",
      label: "查看网页",
      name: "web_fetch",
      args: { url: "https://example.com/xian-weather" },
    },
  });
  state = applyBffChatEvent(state, {
    type: "reasoning.delta",
    data: {
      message_id: "assistant-3",
      delta:
        "用户询问西安明天的天气，我需要使用之前成功的天气查询网站来获取西安的天气预报信息。根据获取的西安天气数据，整理明天（4 月 13 日）的天气预报信息，并可以提供与之前查询的四个城市的对比汇总。",
    },
  });

  assert.equal(
    state.messages[0]?.reasoning_before_tools,
    "根据获取的西安天气数据，整理明天（4 月 13 日）的天气预报信息，并可以提供与之前查询的四个城市的对比汇总。",
  );
  assert.equal(
    state.messages[0]?.reasoning_after_tools,
    "用户询问西安明天的天气，我需要使用之前成功的天气查询网站来获取西安的天气预报信息。",
  );
});
