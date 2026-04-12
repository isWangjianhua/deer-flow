import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("upload APIs support BFF conversation routes", async () => {
  const source = await readFile(new URL("./api.ts", import.meta.url), "utf8");

  assert.ok(
    source.includes('`/api/bff/conversations/${threadId}/uploads`'),
    "expected upload APIs to support the BFF conversation upload route",
  );
  assert.ok(
    source.includes("`${uploadsBasePath(threadId, apiMode)}/${filename}`"),
    "expected upload delete APIs to support the BFF conversation upload route",
  );
});
