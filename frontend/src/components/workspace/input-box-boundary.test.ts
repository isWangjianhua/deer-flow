import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("input box keeps model loading enabled on BFF chat routes", async () => {
  const source = await readFile(new URL("./input-box.tsx", import.meta.url), "utf8");

  assert.ok(
    !source.includes("useModels({ enabled: legacyControlsEnabled })"),
    "expected model loading to remain enabled for BFF chat routes",
  );
  assert.ok(
    !source.includes("!isBffChatRoute(pathname)"),
    "expected follow-up suggestions to stay enabled instead of being disabled on BFF routes",
  );
  assert.ok(
    !source.includes("/api/bff/conversations/${threadId}/suggestions"),
    "expected InputBox not to fetch BFF follow-up suggestions directly",
  );
  assert.ok(
    source.includes("${getBackendBaseURL()}/api/threads/${threadId}/suggestions"),
    "expected InputBox to keep the gateway follow-up suggestions path for non-BFF chat",
  );
});
