import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("Makefile exposes init and installs backend, bff, and frontend dependencies", async () => {
  const source = await readFile(new URL("../Makefile", import.meta.url), "utf8");

  assert.match(
    source,
    /\.PHONY: .*?\binit\b/,
    "expected Makefile to expose a dedicated init target",
  );
  assert.match(
    source,
    /^init:\s+check install$/m,
    "expected init to run prerequisite checks and dependency installation",
  );
  assert.match(
    source,
    /cd backend && uv sync/,
    "expected install to sync backend dependencies",
  );
  assert.match(
    source,
    /cd bff && uv sync/,
    "expected install to sync BFF dependencies",
  );
  assert.match(
    source,
    /cd frontend && pnpm install/,
    "expected install to install frontend dependencies",
  );
});

void test("README documents install as backend, bff, and frontend setup", async () => {
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");

  assert.match(
    readme,
    /make install\s+# Install backend \+ bff \+ frontend dependencies/s,
    "expected the root README install instructions to mention backend, bff, and frontend",
  );
});

void test("backend README points developers to the root install flow", async () => {
  const readme = await readFile(new URL("../backend/README.md", import.meta.url), "utf8");

  assert.match(
    readme,
    /# Install backend, BFF, and frontend dependencies from the repo root\s+make install/s,
    "expected backend README to describe the repo-wide install target",
  );
});
