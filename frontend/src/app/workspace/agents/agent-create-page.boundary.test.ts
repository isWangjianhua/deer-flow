import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("new agent page hands off bootstrap to BFF conversation route", async () => {
  const source = await readFile(new URL("./new/page.tsx", import.meta.url), "utf8");

  assert.ok(source.includes("checkAgentName"));
  assert.ok(source.includes("createAgent"));
  assert.ok(source.includes("createAgentConversation"));
  assert.ok(source.includes("createdAgentName"));
  assert.ok(source.includes("const isRetryingSessionAgent = createdAgentName === trimmed"));
  assert.ok(source.includes("if (!result.available && !isRetryingSessionAgent)"));
  assert.ok(
    source.includes(
      "router.push(`/workspace/agents/${trimmed}/chats/${conversation.id}?bootstrap=1`)",
    ),
  );
  assert.ok(!source.includes("useThreadStream"));
});
