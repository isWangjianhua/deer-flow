import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readSource(relativePath: string) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

void test("settings dialog exposes memory settings again", async () => {
  const source = await readSource("./settings-dialog.tsx");

  assert.ok(
    source.includes("MemorySettingsPage"),
    "expected settings dialog to import MemorySettingsPage",
  );
  assert.ok(
    source.includes('"memory"'),
    "expected settings dialog to declare a memory section",
  );
  assert.ok(
    source.includes("t.settings.sections.memory"),
    "expected settings dialog to surface the localized Memory section label",
  );
});
