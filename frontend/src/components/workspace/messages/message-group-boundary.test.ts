import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("message groups do not force-expand reasoning sections during streaming", async () => {
  const source = await readFile(
    new URL("./message-group.tsx", import.meta.url),
    "utf8",
  );

  assert.ok(
    !source.includes("|| isLoading"),
    "expected message-group to keep the old initial collapse behavior",
  );
  assert.ok(
    !source.includes("setShowAbove(true)"),
    "expected message-group to avoid force-opening previous steps",
  );
  assert.ok(
    !source.includes("setShowLastThinking(true)"),
    "expected message-group to avoid force-opening the thinking panel",
  );
});
