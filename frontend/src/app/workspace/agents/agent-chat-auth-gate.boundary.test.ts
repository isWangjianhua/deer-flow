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
});
