import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("account page uses product-facing account copy", async () => {
  const source = await readFile(
    new URL("../../app/workspace/account/page.tsx", import.meta.url),
    "utf8",
  );

  assert.ok(
    source.includes("Manage your sign-in"),
    "expected the account page to use product-facing account copy",
  );
  assert.ok(
    !source.includes("validate browser OIDC login"),
    "expected the old validation-oriented copy to be removed",
  );
});

void test(
  "auth status card exposes structured status sections and collapsible diagnostics",
  async () => {
    const source = await readFile(new URL("./auth-status-card.tsx", import.meta.url), "utf8");

    assert.ok(
      source.includes("Browser session"),
      "expected a browser session section",
    );
    assert.ok(
      source.includes("BFF connection"),
      "expected a BFF connection section",
    );
    assert.ok(
      source.includes("Diagnostics"),
      "expected a diagnostics section",
    );
    assert.ok(
      source.includes("Collapsible"),
      "expected diagnostics to be placed behind a collapsible",
    );
    assert.ok(
      source.includes("Register"),
      "expected local auth mode to expose a register path",
    );
    assert.ok(
      source.includes('autoComplete="new-password"'),
      "expected register mode to include a confirm-password field",
    );
  },
);
