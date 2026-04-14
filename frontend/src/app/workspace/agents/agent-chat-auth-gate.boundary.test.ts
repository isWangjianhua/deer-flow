import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("agent chat page reuses the login-required submit guard", async () => {
  const source = await readFile(
    new URL("./[agent_name]/chats/[thread_id]/page.tsx", import.meta.url),
    "utf8",
  );

  assert.ok(
    source.includes("useLoginRequiredSubmit"),
    "expected the agent chat page to use the shared login-required submit guard",
  );
  assert.ok(
    source.includes("LoginRequiredDialog"),
    "expected the agent chat page to render the login-required dialog",
  );
  assert.ok(
    source.includes("restoredText"),
    "expected the agent chat page to restore pending draft text after sign-in",
  );
  assert.ok(
    source.includes("void sendMessage(threadId, nextMessage, { agent_name });"),
    "expected authenticated agent chat submits to fire-and-forget so the composer clears immediately",
  );
  assert.ok(
    !source.includes("await sendMessage(threadId, nextMessage, { agent_name });"),
    "expected agent chat page to avoid awaiting sendMessage inside the composer submit handler",
  );
});
