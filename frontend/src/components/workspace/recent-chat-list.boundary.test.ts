import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("recent chat list stays visible on agents routes", async () => {
  const source = await readFile(new URL("./recent-chat-list.tsx", import.meta.url), "utf8");

  assert.ok(
    !source.includes('if (pathname.startsWith("/workspace/agents")) {\n    return null;\n  }'),
    "expected agents routes to keep rendering the recent chat list",
  );
  assert.ok(
    source.includes('return <BffRecentChatList pathname={pathname} />;'),
    "expected recent chat list to continue using the shared BFF recent conversations component",
  );
});
