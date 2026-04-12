import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("serve.sh syncs, starts, and stops the BFF service", async () => {
  const source = await readFile(new URL("./serve.sh", import.meta.url), "utf8");

  assert.match(
    source,
    /\(cd bff && uv sync --quiet\)/,
    "expected serve.sh to install BFF dependencies",
  );
  assert.match(
    source,
    /pkill -f "uvicorn app\.main:app"/,
    "expected serve.sh to stop the BFF process",
  );
  assert.match(
    source,
    /run_service "BFF"/,
    "expected serve.sh to start the BFF service",
  );
  assert.match(
    source,
    /uv run uvicorn app\.main:app --host 0\.0\.0\.0 --port 9000/,
    "expected serve.sh to run the BFF on port 9000",
  );
});
