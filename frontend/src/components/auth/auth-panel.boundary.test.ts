import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("auth panel exposes shared page and dialog auth UI primitives", async () => {
  const source = await readFile(new URL("./auth-panel.tsx", import.meta.url), "utf8");

  assert.ok(
    source.includes('mode = "page"'),
    "expected AuthPanel to support a page presentation mode by default",
  );
  assert.ok(
    source.includes('mode?: "page" | "dialog"'),
    "expected AuthPanel to support both page and dialog presentation modes",
  );
  assert.ok(
    source.includes("onSuccess?: () => void"),
    "expected AuthPanel to notify callers when authentication succeeds",
  );
  assert.ok(
    !source.includes("Languages"),
    "expected AuthPanel to avoid embedding a language switcher",
  );
  assert.ok(
    source.includes("signUpWithLocalPassword"),
    "expected AuthPanel to handle local registration directly",
  );
});
