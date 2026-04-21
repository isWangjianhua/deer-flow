import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("memory settings page uses the restored memory hooks", async () => {
  const source = await readFile(
    new URL("./memory-settings-page.tsx", import.meta.url),
    "utf8",
  );

  assert.ok(source.includes("useMemory"));
  assert.ok(source.includes("useCreateMemoryFact"));
  assert.ok(source.includes("useUpdateMemoryFact"));
  assert.ok(source.includes("useDeleteMemoryFact"));
  assert.ok(source.includes("useImportMemory"));
  assert.ok(source.includes("exportMemory"));
});
