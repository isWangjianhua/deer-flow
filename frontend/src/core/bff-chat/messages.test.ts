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
    data: { tool_call_id: "tool-1", label: "Searching web" },
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
