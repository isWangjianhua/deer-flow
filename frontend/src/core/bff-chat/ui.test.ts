import assert from "node:assert/strict";
import test from "node:test";

const { BFF_NEW_CHAT_PATH, isBffChatRoute, pathOfConversation } = await import(
  new URL("./ui.ts", import.meta.url).href
);

void test("detects the main BFF chat routes", () => {
  assert.equal(BFF_NEW_CHAT_PATH, "/workspace/chats/new");
  assert.equal(isBffChatRoute("/workspace/chats"), true);
  assert.equal(isBffChatRoute("/workspace/chats/new"), true);
  assert.equal(isBffChatRoute("/workspace/chat/new"), true);
  assert.equal(isBffChatRoute("/workspace/chats/abc-123"), true);
});

void test("ignores legacy or non-chat routes", () => {
  assert.equal(isBffChatRoute("/workspace"), false);
  assert.equal(isBffChatRoute("/workspace/agents/demo/chats/thread-1"), false);
  assert.equal(isBffChatRoute("/workspace/account"), false);
});

void test("builds chat route paths for both normal and agent conversations", () => {
  assert.equal(
    pathOfConversation({ id: "conversation-1" }),
    "/workspace/chats/conversation-1",
  );
  assert.equal(
    pathOfConversation({
      id: "conversation-2",
      agent_name: "demo-agent",
    }),
    "/workspace/agents/demo-agent/chats/conversation-2",
  );
});
