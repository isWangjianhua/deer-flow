import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("workspace header localizes the account navigation label", async () => {
  const source = await readFile(new URL("./workspace-header.tsx", import.meta.url), "utf8");

  assert.ok(
    source.includes("t.sidebar.account"),
    "expected the workspace header to read the account label from i18n",
  );
  assert.ok(
    !source.includes(">Account<"),
    "expected the workspace header to avoid hard-coded Account copy",
  );
});

void test("workspace header reads brand labels from the shared brand module", async () => {
  const source = await readFile(new URL("./workspace-header.tsx", import.meta.url), "utf8");

  assert.ok(
    source.includes("@/core/brand"),
    "expected the workspace header to import shared brand constants",
  );
  assert.ok(
    !source.includes("DeerFlow"),
    "expected the workspace header to avoid hard-coded expanded brand copy",
  );
  assert.ok(
    !source.includes(">DF<"),
    "expected the workspace header to avoid hard-coded collapsed brand initials",
  );
});
