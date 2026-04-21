import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("recent chat list stays visible on agents routes", async () => {
  const source = await readFile(new URL("./recent-chat-list.tsx", import.meta.url), "utf8");

  assert.ok(
    source.includes('pathname.startsWith("/workspace/agents")'),
    "expected agents routes to be part of the recent chat render condition",
  );
  assert.ok(
    source.includes('return <BffRecentChatList pathname={pathname} />;'),
    "expected recent chat list to continue using the shared BFF recent conversations component",
  );
});
