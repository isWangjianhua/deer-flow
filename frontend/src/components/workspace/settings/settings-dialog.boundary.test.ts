import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readSource(relativePath: string) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

void test("settings dialog no longer exposes memory settings", async () => {
  const source = await readSource("./settings-dialog.tsx");

  assert.ok(
    !source.includes("MemorySettingsPage"),
    "expected settings dialog to stop importing MemorySettingsPage",
  );
  assert.ok(
    !source.includes('"memory"'),
    "expected settings dialog to stop declaring a memory section",
  );
});
