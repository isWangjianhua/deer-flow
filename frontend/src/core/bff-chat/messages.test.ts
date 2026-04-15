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
  });
  assert.equal(messages[2]?.type, "tool");
  assert.equal(messages[3]?.type, "ai");
  assert.equal(messages[2]?.content, "Looking for sources");
});

void test("uses enriched tool args in synthesized streaming messages without duplicating the tool step", () => {
  let state = createInitialChatState();
  state = applyBffChatEvent(state, {
    type: "message.started",
    data: { message_id: "assistant-tool-args" },
  });
  state = applyBffChatEvent(state, {
    type: "tool.started",
    data: {
      tool_call_id: "tool-search",
      label: "web_search",
      name: "web_search",
      args: {},
    },
  });
  state = applyBffChatEvent(state, {
    type: "tool.started",
    data: {
      tool_call_id: "tool-search",
      label: "web_search",
      name: "web_search",
      args: { query: "上海 4 月 13 日 天气" },
    },
  });

  const messages = toThreadMessages(state, []);

  assert.equal(messages.length, 3);
  assert.equal(messages[0]?.type, "ai");
  assert.deepEqual(messages[0]?.tool_calls?.[0]?.args, {
    query: "上海 4 月 13 日 天气",
  });
});

void test("preserves an explicit tool description without replacing it from the BFF label", () => {
  let state = createInitialChatState();
  state = applyBffChatEvent(state, {
    type: "message.started",
    data: { message_id: "assistant-explicit-description" },
  });
  state = applyBffChatEvent(state, {
    type: "tool.started",
    data: {
      tool_call_id: "tool-explicit-description",
      label: "Searching web",
      name: "web_search",
      args: {
        query: "weather",
        description: "Search for weather details",
      },
    },
  });

  const messages = toThreadMessages(state, []);

  assert.deepEqual(messages[0]?.tool_calls?.[0]?.args, {
    query: "weather",
    description: "Search for weather details",
  });
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
  assert.equal(messages[0]?.id, "assistant-3-tool-3-tool-call");
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

void test("keeps reasoning steps interleaved between multiple tool calls", () => {
  let state = createInitialChatState();
  state = applyBffChatEvent(state, {
    type: "message.started",
    data: { message_id: "assistant-6" },
  });
  state = applyBffChatEvent(state, {
    type: "reasoning.delta",
    data: { message_id: "assistant-6", delta: "先判断成都天气需要查网页。" },
  });
  state = applyBffChatEvent(state, {
    type: "tool.started",
    data: {
      tool_call_id: "tool-6a",
      label: "查看网页",
      name: "web_fetch",
      args: { url: "https://example.com/chengdu" },
    },
  });
  state = applyBffChatEvent(state, {
    type: "tool.progress",
    data: { tool_call_id: "tool-6a", message: "成都天气预报" },
  });
  state = applyBffChatEvent(state, {
    type: "reasoning.delta",
    data: { message_id: "assistant-6", delta: "已经拿到成都天气，接着查询西安。" },
  });
  state = applyBffChatEvent(state, {
    type: "tool.started",
    data: {
      tool_call_id: "tool-6b",
      label: "查看网页",
      name: "web_fetch",
      args: { url: "https://example.com/xian" },
    },
  });
  state = applyBffChatEvent(state, {
    type: "tool.progress",
    data: { tool_call_id: "tool-6b", message: "西安天气预报" },
  });
  state = applyBffChatEvent(state, {
    type: "reasoning.delta",
    data: { message_id: "assistant-6", delta: "两地结果都齐了，现在整理最终回答。" },
  });
  state = applyBffChatEvent(state, {
    type: "message.delta",
    data: { message_id: "assistant-6", delta: "最终回答" },
  });

  const messages = toThreadMessages(state, []);

  assert.equal(messages.length, 8);
  assert.equal(
    messages[0]?.additional_kwargs?.reasoning_content,
    "先判断成都天气需要查网页。",
  );
  assert.equal(messages[1]?.tool_calls?.[0]?.id, "tool-6a");
  assert.equal(messages[2]?.type, "tool");
  assert.equal(
    messages[3]?.additional_kwargs?.reasoning_content,
    "已经拿到成都天气，接着查询西安。",
  );
  assert.equal(messages[4]?.tool_calls?.[0]?.id, "tool-6b");
  assert.equal(messages[5]?.type, "tool");
  assert.equal(
    messages[6]?.additional_kwargs?.reasoning_content,
    "两地结果都齐了，现在整理最终回答。",
  );
  assert.equal(messages[7]?.content, "最终回答");
});

void test("deduplicates snapshot-style reasoning updates before synthesizing UI messages", () => {
  let state = createInitialChatState();

  const firstReasoning =
    "用户询问西安天气，但之前的 web_search 工具返回错误（No results found）。让我尝试使用不同的搜索词或网站来获取西安的天气信息。";
  const secondReasoning =
    "搜索结果不相关，让我尝试用其他天气网站查询西安天气。";
  const thirdReasoning =
    "让我尝试访问中国天气网的西安页面来获取天气数据。";

  state = applyBffChatEvent(state, {
    type: "message.started",
    data: { message_id: "assistant-7" },
  });
  state = applyBffChatEvent(state, {
    type: "reasoning.delta",
    data: { message_id: "assistant-7", delta: firstReasoning },
  });
  state = applyBffChatEvent(state, {
    type: "tool.started",
    data: {
      tool_call_id: "tool-7",
      label: "搜索相关信息",
      name: "web_search",
      args: { query: "西安 天气" },
    },
  });
  state = applyBffChatEvent(state, {
    type: "reasoning.delta",
    data: { message_id: "assistant-7", delta: secondReasoning },
  });
  state = applyBffChatEvent(state, {
    type: "reasoning.delta",
    data: {
      message_id: "assistant-7",
      delta: `${firstReasoning}${secondReasoning}${thirdReasoning}`,
    },
  });

  const messages = toThreadMessages(state, []);

  assert.equal(messages.length, 4);
  assert.equal(
    messages[3]?.additional_kwargs?.reasoning_content,
    `${secondReasoning}${thirdReasoning}`,
  );
});
