import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("login required dialog wraps AuthPanel inside a reusable dialog shell", async () => {
  const source = await readFile(
    new URL("./login-required-dialog.tsx", import.meta.url),
    "utf8",
  );

  assert.ok(
    source.includes("DialogContent"),
    "expected dialog content to be used",
  );
  assert.ok(
    source.includes('className="overflow-hidden border bg-background p-0 shadow-xl sm:max-w-md"'),
    "expected the login dialog to use a compact neutral modal shell",
  );
  assert.ok(
    !source.includes("radial-gradient"),
    "expected the login dialog to avoid decorative gradient headers",
  );
  assert.ok(source.includes('mode="dialog"'), "expected AuthPanel dialog mode");
  assert.ok(
    source.includes("onBeforeOidcRedirect"),
    "expected dialog to support OIDC draft persistence before redirect",
  );
});
