import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("check.py points developers at make init and repo-wide dependency install", async () => {
  const source = await readFile(new URL("./check.py", import.meta.url), "utf8");

  assert.match(
    source,
    /make init\s+- Check prerequisites and install backend, BFF, and frontend dependencies/,
    "expected check.py to guide developers toward the repo-wide init flow",
  );
  assert.match(
    source,
    /make install\s+- Install backend, BFF, and frontend dependencies/,
    "expected check.py to describe install as backend, BFF, and frontend setup",
  );
});
