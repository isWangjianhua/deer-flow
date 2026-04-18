import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("welcome reads homepage copy from the shared brand module", async () => {
  const source = await readFile(new URL("./welcome.tsx", import.meta.url), "utf8");

  assert.ok(
    source.includes("@/core/brand"),
    "expected welcome to import shared brand content",
  );
  assert.ok(
    !source.includes("t.welcome.greeting"),
    "expected welcome greeting to avoid direct i18n lookup",
  );
  assert.ok(
    !source.includes("t.welcome.description"),
    "expected welcome description to avoid direct i18n lookup",
  );
  assert.ok(
    !source.includes('isUltra ? "🚀" : "👋"'),
    "expected welcome icons to avoid hard-coded inline emoji",
  );
});
