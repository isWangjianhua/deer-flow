import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("shared BFF proxy helper centralizes auth and JSON response normalization", async () => {
  const source = await readFile(new URL("./proxy.ts", import.meta.url), "utf8");

  assert.ok(
    source.includes("requireBffAuth"),
    "expected the shared BFF proxy helper to own BFF auth enforcement",
  );
  assert.ok(
    source.includes("jsonProxyResponse"),
    "expected the shared BFF proxy helper to centralize JSON response normalization",
  );
  assert.ok(
    source.includes("proxyAuthenticatedBffJson"),
    "expected the shared BFF proxy helper to expose a reusable authenticated JSON proxy entrypoint",
  );
});
