import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("frontend package scripts keep Turbopack as the default dev server", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("./package.json", import.meta.url), "utf8"),
  );

  assert.equal(
    packageJson.scripts.dev,
    "next dev --turbo",
    "expected pnpm dev to use Turbopack for fast route compilation",
  );
  assert.equal(
    packageJson.scripts["dev:webpack"],
    "next dev --webpack",
    "expected webpack to remain available only as an explicit fallback",
  );
  assert.equal(
    packageJson.scripts.preview,
    "next build && next start",
    "expected pnpm preview to remain the explicit rebuild-and-start helper",
  );
  assert.equal(
    packageJson.scripts.start,
    "next start",
    "expected pnpm start to remain the fast path for an existing production build",
  );
});
