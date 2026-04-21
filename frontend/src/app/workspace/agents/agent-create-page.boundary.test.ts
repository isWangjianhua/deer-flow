import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("new agent page restores the bootstrap creation flow", async () => {
  const source = await readFile(new URL("./new/page.tsx", import.meta.url), "utf8");

  assert.ok(source.includes("checkAgentName"));
  assert.ok(source.includes("createAgent"));
  assert.ok(source.includes("setup_agent"));
  assert.ok(source.includes("getAgentWithRetry"));
  assert.ok(!source.includes("AgentsDisabledState"));
});
