import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("serve.sh syncs, starts, and stops the BFF service", async () => {
  const source = await readFile(
    new URL("../../scripts/serve.sh", import.meta.url),
    "utf8",
  );

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
  assert.match(
    source,
    /QDRANT_MODE=/,
    "expected serve.sh to derive a qdrant preflight mode from the runtime mode",
  );
  assert.match(
    source,
    /"\$REPO_ROOT\/scripts\/ensure-qdrant\.sh" --mode="\$QDRANT_MODE"/,
    "expected serve.sh to pass the derived qdrant preflight mode through to ensure-qdrant.sh",
  );
});

void test("serve.sh reuses existing frontend builds in prod and persists Better Auth secrets", async () => {
  const source = await readFile(
    new URL("../../scripts/serve.sh", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(
    source,
    /pnpm run preview/,
    "expected serve.sh prod mode to avoid always rebuilding through pnpm run preview",
  );
  assert.match(
    source,
    /\.next\/BUILD_ID/,
    "expected serve.sh prod mode to check for an existing Next.js build artifact",
  );
  assert.match(
    source,
    /pnpm run build && pnpm run start/,
    "expected serve.sh prod mode to build only when no production build exists yet",
  );
  assert.match(
    source,
    /\.better-auth-secret/,
    "expected serve.sh to persist a local Better Auth secret for production runs",
  );
});

void test("start-daemon.sh remains a prod daemon wrapper", async () => {
  const source = await readFile(
    new URL("../../scripts/start-daemon.sh", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /serve\.sh" --prod --daemon/,
    "expected start-daemon.sh to match its prod daemon name",
  );
});
