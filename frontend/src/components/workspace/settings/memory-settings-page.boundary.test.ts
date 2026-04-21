import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("memory settings page is readonly and handles unauthenticated state", async () => {
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

void test("memory settings page guards empty timestamps before formatting time ago", async () => {
  const source = await readFile(
    new URL("./memory-settings-page.tsx", import.meta.url),
    "utf8",
  );

  assert.ok(
    source.includes("memory.lastUpdated ? formatTimeAgo(memory.lastUpdated) : null"),
    "expected memory lastUpdated to be checked before calling formatTimeAgo",
  );
  assert.ok(
    source.includes("fact.createdAt ? formatTimeAgo(fact.createdAt) : null"),
    "expected fact createdAt to be checked before calling formatTimeAgo",
  );
  assert.ok(
    !source.includes("{formatTimeAgo(memory.lastUpdated)}"),
    "expected memory lastUpdated formatting to stop being unconditional",
  );
  assert.ok(
    !source.includes("{formatTimeAgo(fact.createdAt)}"),
    "expected fact createdAt formatting to stop being unconditional",
  );
});
