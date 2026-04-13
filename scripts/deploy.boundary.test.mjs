import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("deploy.sh ensures Qdrant for production Mem0 deployments", async () => {
  const source = await readFile(new URL("./deploy.sh", import.meta.url), "utf8");

  assert.match(
    source,
    /"\$REPO_ROOT\/scripts\/ensure-qdrant\.sh" --mode=prod/,
    "expected deploy.sh to ensure Qdrant before starting containers",
  );
  assert.match(
    source,
    /services="\$services qdrant"/,
    "expected deploy.sh to include the qdrant service when required",
  );
});

void test("docker compose defines a qdrant service for production startup", async () => {
  const source = await readFile(new URL("../docker/docker-compose.yaml", import.meta.url), "utf8");

  assert.match(source, /^\s{2}qdrant:\s*$/m, "expected production docker compose to define a qdrant service");
  assert.match(source, /qdrant\/qdrant:/, "expected qdrant service to use the official qdrant image");
});
