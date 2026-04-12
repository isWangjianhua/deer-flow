import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("model loading uses the BFF bridge path", async () => {
  const source = await readFile(new URL("./api.ts", import.meta.url), "utf8");

  assert.ok(
    source.includes('fetchImpl("/api/bff/models"'),
    "expected model loading to use the same-origin BFF models route",
  );
});
