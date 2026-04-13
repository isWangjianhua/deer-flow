import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("ensure-qdrant.sh checks mem0+qdrant config before starting a local container", async () => {
  const source = await readFile(new URL("./ensure-qdrant.sh", import.meta.url), "utf8");

  assert.match(source, /MEMORY_PROVIDER=/, "expected ensure-qdrant.sh to inspect memory provider config");
  assert.match(source, /VECTOR_STORE_PROVIDER=/, "expected ensure-qdrant.sh to inspect the vector store config");
  assert.match(source, /docker run[\s\S]*qdrant\/qdrant/, "expected ensure-qdrant.sh to start a local qdrant container in dev mode");
  assert.match(source, /wait-for-port\.sh/, "expected ensure-qdrant.sh to wait for qdrant readiness");
});
