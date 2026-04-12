import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("input box keeps model loading enabled on BFF chat routes", async () => {
  const source = await readFile(new URL("./input-box.tsx", import.meta.url), "utf8");

  assert.ok(
    !source.includes("useModels({ enabled: legacyControlsEnabled })"),
    "expected model loading to remain enabled for BFF chat routes",
  );
});
