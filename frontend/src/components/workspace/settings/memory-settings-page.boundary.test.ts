import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("memory settings page stays readonly and handles unauthenticated state", async () => {
  const source = await readFile(
    new URL("./memory-settings-page.tsx", import.meta.url),
    "utf8",
  );

  assert.ok(source.includes("useMemory"));
  assert.ok(!source.includes("useCreateMemoryFact"));
  assert.ok(!source.includes("useUpdateMemoryFact"));
  assert.ok(!source.includes("useDeleteMemoryFact"));
  assert.ok(!source.includes("useImportMemory"));
  assert.ok(!source.includes("useClearMemory"));
  assert.ok(!source.includes("PlusIcon"));
  assert.ok(!source.includes("Trash2Icon"));
  assert.ok(source.includes("isUnauthenticated"));
});

void test("memory settings page hides summary sections when all summaries are empty", async () => {
  const source = await readFile(
    new URL("./memory-settings-page.tsx", import.meta.url),
    "utf8",
  );

  assert.ok(source.includes("isMemorySummaryEmpty(memory)"));
  assert.ok(
    source.includes(
      "const summariesAvailable = memory ? !isMemorySummaryEmpty(memory) : false;",
    ),
  );
  assert.ok(
    source.includes(
      'const showSummaries =\n    summariesAvailable && (filter === "all" || filter === "summaries");',
    ),
  );
  assert.ok(source.includes("{summariesAvailable ? ("));
  assert.ok(
    source.includes('value={summariesAvailable ? filter : "facts"}'),
    "expected the filter control to collapse to facts-only when summaries are unavailable",
  );
  assert.ok(
    source.includes('{summariesAvailable ? (\n              <div className="text-muted-foreground text-sm">'),
    "expected summary helper copy to render conditionally",
  );
});
