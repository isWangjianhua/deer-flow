import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("artifact helpers support BFF conversation routes", async () => {
  const source = await readFile(new URL("./utils.ts", import.meta.url), "utf8");

  assert.ok(
    source.includes('`/api/bff/conversations/${threadId}/artifacts${filepath}'),
    "expected artifact URLs to support same-origin BFF conversation routes",
  );
  assert.ok(
    source.includes('`/api/bff/conversations/${threadId}/artifacts${absolutePath}`'),
    "expected artifact resolution to support same-origin BFF conversation routes",
  );
});
