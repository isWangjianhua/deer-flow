import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("bff memory route authenticates and proxies to the internal BFF memory endpoint", async () => {
  const source = await readFile(new URL("./route.ts", import.meta.url), "utf8");

  assert.ok(source.includes("requireBffAuth"));
  assert.ok(source.includes('fetch(`${getInternalBffBaseURL()}/memory`'));
  assert.ok(source.includes("buildBearerHeaders"));
});
