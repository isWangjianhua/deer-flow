import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("agent chat page restores the login-aware shared chat shell", async () => {
  const source = await readFile(
    new URL("./[agent_name]/chats/[conversation_id]/page.tsx", import.meta.url),
    "utf8",
  );

  assert.ok(source.includes("useLoginRequiredSubmit"));
  assert.ok(source.includes("useBffThreadStream"));
  assert.ok(source.includes("createAgentConversation"));
  assert.ok(
    source.includes("createConversationForThread: () => createAgentConversation(agentName)"),
  );
  assert.ok(source.includes("saveCommandMessage"));
  assert.ok(source.includes("bootstrapRequested"));
  assert.ok(!source.includes("useThreadStream"));
});

void test("agent chats subtree keeps shared chat providers at the parent layout", async () => {
  const source = await readFile(
    new URL("./[agent_name]/chats/layout.tsx", import.meta.url),
    "utf8",
  );

  assert.ok(source.includes("SubtasksProvider"));
  assert.ok(source.includes("ArtifactsProvider"));
  assert.ok(source.includes("PromptInputProvider"));
});
