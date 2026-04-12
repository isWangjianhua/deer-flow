import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("bff models route proxies to the internal BFF service", async () => {
  const source = await readFile(new URL("./route.ts", import.meta.url), "utf8");

  assert.ok(
    source.includes('fetch(`${getInternalBffBaseURL()}/models`'),
    "expected the BFF models route to proxy to the internal BFF /models endpoint",
  );
  assert.ok(
    !source.includes("requireBffAuth"),
    "expected model discovery to remain unauthenticated like the legacy gateway route",
  );
});
