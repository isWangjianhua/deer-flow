import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("ensure-qdrant.sh checks mem0+qdrant config before starting a local container", async () => {
  const source = await readFile(new URL("./ensure-qdrant.sh", import.meta.url), "utf8");

  assert.match(source, /MEMORY_PROVIDER=/, "expected ensure-qdrant.sh to inspect memory provider config");
  assert.match(source, /VECTOR_STORE_PROVIDER=/, "expected ensure-qdrant.sh to inspect the vector store config");
  assert.match(source, /curl[\s\S]*\/healthz/, "expected ensure-qdrant.sh to perform an HTTP health check against Qdrant");
  assert.match(source, /for candidate in docker podman/, "expected ensure-qdrant.sh to detect an available container runtime");
  assert.match(source, /start_existing_container/, "expected ensure-qdrant.sh to reuse an existing Qdrant container when present");
  assert.match(source, /run_new_container/, "expected ensure-qdrant.sh to create a local Qdrant container in dev mode when needed");
  assert.match(source, /qdrant\/qdrant:latest/, "expected ensure-qdrant.sh to use the official Qdrant image");
});
