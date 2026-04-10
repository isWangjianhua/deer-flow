import assert from "node:assert/strict";
import test from "node:test";

const { isBffChatRoute } = await import(new URL("./ui.ts", import.meta.url).href);

void test("detects the main BFF chat routes", () => {
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
