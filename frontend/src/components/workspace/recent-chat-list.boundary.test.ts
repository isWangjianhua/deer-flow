import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("agent workspace routes do not render the legacy raw thread recent list", async () => {
  const source = await readFile(
    new URL("./recent-chat-list.tsx", import.meta.url),
    "utf8",
  );

  assert.ok(
    source.includes('if (pathname.startsWith("/workspace/agents")) {\n    return null;\n  }'),
    "expected agent workspace routes to hide the legacy recent thread list until they use a user-scoped data source",
  );
  assert.ok(
    !source.includes("return <LegacyRecentChatList pathname={pathname} />;"),
    "expected agent workspace routes to avoid rendering the legacy raw thread recent list",
  );
});
