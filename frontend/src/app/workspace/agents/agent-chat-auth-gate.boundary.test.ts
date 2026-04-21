import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("agent chat page restores the login-aware shared chat shell", async () => {
  const source = await readFile(
    new URL("./[agent_name]/chats/[thread_id]/page.tsx", import.meta.url),
    "utf8",
  );

  assert.ok(source.includes("useLoginRequiredSubmit"));
  assert.ok(source.includes("useThreadStream"));
  assert.ok(source.includes("AgentWelcome"));
  assert.ok(!source.includes("AgentsDisabledState"));
});
