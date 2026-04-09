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
