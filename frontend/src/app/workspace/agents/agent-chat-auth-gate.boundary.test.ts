import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("agent chat page renders the shared disabled state", async () => {
  const source = await readFile(
    new URL("./[agent_name]/chats/[thread_id]/page.tsx", import.meta.url),
    "utf8",
  );

  assert.ok(
    source.includes("AgentsDisabledState"),
    "expected the agent chat page to use the shared disabled-state component while agent chat stays off",
  );
  assert.ok(
    !source.includes("useLoginRequiredSubmit"),
    "expected the disabled agent chat page to stop wiring the legacy raw-thread chat flow",
  );
});
