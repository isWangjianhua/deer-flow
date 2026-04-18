import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("input box reads suggestion buttons from the shared brand module", async () => {
  const source = await readFile(new URL("./input-box.tsx", import.meta.url), "utf8");

  assert.ok(
    source.includes("@/core/brand"),
    "expected input box to import shared brand configuration",
  );
  assert.ok(
    !source.includes("t.inputBox.surpriseMePrompt"),
    "expected surprise prompt to avoid direct i18n lookup",
  );
  assert.ok(
    !source.includes("t.inputBox.suggestions.map"),
    "expected suggestion chips to avoid direct i18n lookup",
  );
  assert.ok(
    !source.includes("t.inputBox.placeholder"),
    "expected input placeholder to avoid direct i18n lookup",
  );
});
