import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("workspace chat page gates submit behind the login dialog", async () => {
  const source = await readFile(
    new URL("./chat-page.tsx", import.meta.url),
    "utf8",
  );

  assert.ok(
    source.includes("useLoginRequiredSubmit"),
    "expected chat page to use the shared login-required submit guard",
  );
  assert.ok(
    source.includes("LoginRequiredDialog"),
    "expected chat page to render the login-required dialog",
  );
  assert.ok(
    source.includes("restoredText"),
    "expected chat page to restore a pending draft after sign-in",
  );
});
