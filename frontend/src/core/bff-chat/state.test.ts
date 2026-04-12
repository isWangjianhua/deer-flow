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

void test("keeps true incremental post-tool reasoning chunks without trimming them away", () => {
  let state = createInitialChatState();

  state = applyBffChatEvent(state, {
    type: "message.started",
    data: { message_id: "assistant-2b" },
  });
  state = applyBffChatEvent(state, {
    type: "reasoning.delta",
    data: { message_id: "assistant-2b", delta: "Plan the next step." },
  });
  state = applyBffChatEvent(state, {
    type: "tool.started",
    data: {
      tool_call_id: "tool-2b",
      label: "Search web",
      name: "web_search",
      args: { query: "Chengdu weather" },
    },
  });
  state = applyBffChatEvent(state, {
    type: "reasoning.delta",
    data: { message_id: "assistant-2b", delta: "Now summarize" },
  });
  state = applyBffChatEvent(state, {
    type: "reasoning.delta",
    data: { message_id: "assistant-2b", delta: " the result." },
  });

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

void test("strips repeated historical reasoning prefixes from later post-tool snapshots", () => {
  let state = createInitialChatState();

  const firstReasoning =
    "用户询问西安天气，但之前的 web_search 工具返回错误（No results found）。让我尝试使用不同的搜索词或网站来获取西安的天气信息。";
  const secondReasoning =
    "搜索结果不相关，让我尝试用其他天气网站查询西安天气。";
  const thirdReasoning =
    "让我尝试访问中国天气网的西安页面来获取天气数据。";

  state = applyBffChatEvent(state, {
    type: "message.started",
    data: { message_id: "assistant-4" },
  });
  state = applyBffChatEvent(state, {
    type: "reasoning.delta",
    data: {
      message_id: "assistant-4",
      delta: firstReasoning,
    },
  });
  state = applyBffChatEvent(state, {
    type: "tool.started",
    data: {
      tool_call_id: "tool-4a",
      label: "搜索相关信息",
      name: "web_search",
      args: { query: "西安 天气" },
    },
  });
  state = applyBffChatEvent(state, {
    type: "reasoning.delta",
    data: {
      message_id: "assistant-4",
      delta: secondReasoning,
    },
  });
  state = applyBffChatEvent(state, {
    type: "tool.started",
    data: {
      tool_call_id: "tool-4b",
      label: "查看网页",
      name: "web_fetch",
      args: { url: "https://example.com/xian-weather" },
    },
  });
  state = applyBffChatEvent(state, {
    type: "reasoning.delta",
    data: {
      message_id: "assistant-4",
      delta: `${firstReasoning}${secondReasoning}${firstReasoning}${secondReasoning}${thirdReasoning}`,
    },
  });

  assert.equal(state.messages[0]?.steps.length, 5);
  assert.equal(state.messages[0]?.steps[0]?.type, "reasoning");
  assert.equal(state.messages[0]?.steps[2]?.type, "reasoning");
  assert.equal(state.messages[0]?.steps[4]?.type, "reasoning");
  if (state.messages[0]?.steps[4]?.type !== "reasoning") {
    throw new Error("expected the final step to be a reasoning step");
  }
  assert.equal(state.messages[0].steps[4].content, thirdReasoning);
});

void test("collapses repeated snapshot updates within the same pre-tool reasoning step", () => {
  let state = createInitialChatState();

  state = applyBffChatEvent(state, {
    type: "message.started",
    data: { message_id: "assistant-5" },
  });
  state = applyBffChatEvent(state, {
    type: "reasoning.delta",
    data: { message_id: "assistant-5", delta: "先判断需要查询西安天气" },
  });
  state = applyBffChatEvent(state, {
    type: "reasoning.delta",
    data: { message_id: "assistant-5", delta: "先判断需要查询西安天气，再选择可用网站。" },
  });

  assert.equal(state.messages[0]?.steps.length, 1);
  assert.equal(state.messages[0]?.steps[0]?.type, "reasoning");
  if (state.messages[0]?.steps[0]?.type !== "reasoning") {
    throw new Error("expected the first step to remain a reasoning step");
  }
  assert.equal(
    state.messages[0].steps[0].content,
    "先判断需要查询西安天气，再选择可用网站。",
  );
  assert.equal(
    state.messages[0]?.reasoning_before_tools,
    "先判断需要查询西安天气，再选择可用网站。",
  );
});

void test("collapses repeated snapshot updates within the same post-tool reasoning step", () => {
  let state = createInitialChatState();

  const firstReasoning =
    "用户询问西安天气，但之前的 web_search 工具返回错误（No results found）。让我尝试使用不同的搜索词或网站来获取西安的天气信息。";
  const secondReasoning =
    "搜索结果不相关，让我尝试用其他天气网站查询西安天气。";
  const thirdReasoning =
    "让我尝试访问中国天气网的西安页面来获取天气数据。";
  const finalSnapshot = `${firstReasoning}${secondReasoning}${thirdReasoning}`;

  state = applyBffChatEvent(state, {
    type: "message.started",
    data: { message_id: "assistant-6" },
  });
  state = applyBffChatEvent(state, {
    type: "reasoning.delta",
    data: {
      message_id: "assistant-6",
      delta: firstReasoning,
    },
  });
  state = applyBffChatEvent(state, {
    type: "tool.started",
    data: {
      tool_call_id: "tool-6a",
      label: "搜索相关信息",
      name: "web_search",
      args: { query: "西安 天气" },
    },
  });
  state = applyBffChatEvent(state, {
    type: "reasoning.delta",
    data: {
      message_id: "assistant-6",
      delta: secondReasoning,
    },
  });
  state = applyBffChatEvent(state, {
    type: "reasoning.delta",
    data: {
      message_id: "assistant-6",
      delta: finalSnapshot,
    },
  });

  assert.equal(state.messages[0]?.steps.length, 3);
  assert.equal(state.messages[0]?.steps[2]?.type, "reasoning");
  if (state.messages[0]?.steps[2]?.type !== "reasoning") {
    throw new Error("expected the last step to remain a reasoning step");
  }
  assert.equal(
    state.messages[0].steps[2].content,
    `${secondReasoning}${thirdReasoning}`,
  );
  assert.equal(
    state.messages[0]?.reasoning_after_tools,
    `${secondReasoning}${thirdReasoning}`,
  );
});

void test("ignores repeated historical reasoning steps that the BFF re-emits after a new tool starts", () => {
  let state = createInitialChatState();

  const firstReasoning =
    "用户查询上海明天天气，当前日期是 2026-04-12，明天就是 2026-04-13。我需要使用 web_search 工具来搜索上海明天的天气预报信息。";
  const secondReasoning =
    "搜索结果中有些信息不够准确或日期混乱，需要访问中国天气网 (weather.com.cn) 获取更准确的上海明天 (4 月 13 日) 天气预报详情。";
  const thirdReasoning =
    "第一次 web_fetch 失败了，我需要尝试访问另一个天气网站来获取上海明天的天气预报信息。";

  state = applyBffChatEvent(state, {
    type: "message.started",
    data: { message_id: "assistant-live-1" },
  });
  state = applyBffChatEvent(state, {
    type: "reasoning.delta",
    data: { message_id: "assistant-live-1", delta: firstReasoning },
  });
  state = applyBffChatEvent(state, {
    type: "tool.started",
    data: {
      tool_call_id: "tool-search",
      label: "搜索相关信息",
      name: "web_search",
      args: { query: "上海 4 月 13 日 天气" },
    },
  });
  state = applyBffChatEvent(state, {
    type: "reasoning.delta",
    data: { message_id: "assistant-live-1", delta: secondReasoning },
  });
  state = applyBffChatEvent(state, {
    type: "tool.started",
    data: {
      tool_call_id: "tool-fetch",
      label: "查看网页",
      name: "web_fetch",
      args: { url: "https://www.weather.com.cn/weather/101020100.shtml" },
    },
  });
  state = applyBffChatEvent(state, {
    type: "reasoning.delta",
    data: { message_id: "assistant-live-1", delta: firstReasoning },
  });
  state = applyBffChatEvent(state, {
    type: "reasoning.delta",
    data: { message_id: "assistant-live-1", delta: secondReasoning },
  });
  state = applyBffChatEvent(state, {
    type: "reasoning.delta",
    data: { message_id: "assistant-live-1", delta: thirdReasoning },
  });

  assert.equal(state.messages[0]?.steps.length, 5);
  assert.equal(state.messages[0]?.steps[4]?.type, "reasoning");
  if (state.messages[0]?.steps[4]?.type !== "reasoning") {
    throw new Error("expected the final step to be a reasoning step");
  }
  assert.equal(state.messages[0].steps[4].content, thirdReasoning);
});

void test("strips repeated full-turn reasoning snapshots before the next tool boundary", () => {
  let state = createInitialChatState();

  const firstReasoning = "A";
  const secondReasoning = "B";
  const thirdReasoning = "C";

  state = applyBffChatEvent(state, {
    type: "message.started",
    data: { message_id: "assistant-7" },
  });
  state = applyBffChatEvent(state, {
    type: "reasoning.delta",
    data: {
      message_id: "assistant-7",
      delta: firstReasoning,
    },
  });
  state = applyBffChatEvent(state, {
    type: "tool.started",
    data: {
      tool_call_id: "tool-7a",
      label: "搜索相关信息",
      name: "web_search",
      args: { query: "西安 天气" },
    },
  });
  state = applyBffChatEvent(state, {
    type: "reasoning.delta",
    data: {
      message_id: "assistant-7",
      delta: secondReasoning,
    },
  });
  state = applyBffChatEvent(state, {
    type: "reasoning.delta",
    data: {
      message_id: "assistant-7",
      delta: `${firstReasoning}${secondReasoning}${firstReasoning}${secondReasoning}${thirdReasoning}`,
    },
  });

  assert.equal(state.messages[0]?.steps.length, 3);
  assert.equal(state.messages[0]?.steps[2]?.type, "reasoning");
  if (state.messages[0]?.steps[2]?.type !== "reasoning") {
    throw new Error("expected the current step to remain a reasoning step");
  }
  assert.equal(state.messages[0].steps[2].content, `${secondReasoning}${thirdReasoning}`);
  assert.equal(state.messages[0]?.reasoning_after_tools, `${secondReasoning}${thirdReasoning}`);
});
