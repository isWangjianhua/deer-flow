import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("artifact barrel avoids exporting the heavy file detail panel", async () => {
  const source = await readFile(new URL("./index.ts", import.meta.url), "utf8");

  assert.ok(
    !source.includes('export * from "./artifact-file-detail";'),
    "expected artifact-file-detail to stay out of the shared barrel export",
  );
});
