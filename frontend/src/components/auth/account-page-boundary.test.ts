import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("account page composes the shared auth panel and session card", async () => {
  const source = await readFile(
    new URL("../../app/workspace/account/page.tsx", import.meta.url),
    "utf8",
  );

  assert.ok(
    source.includes("AuthPanel"),
    "expected the account page to render the shared auth panel",
  );
  assert.ok(
    source.includes("AccountSessionCard"),
    "expected the account page to render the account session card",
  );
  assert.ok(
    source.includes("max-w-3xl"),
    "expected the account page to use a tighter single-column container",
  );
  assert.ok(
    source.includes("LogoutButton"),
    "expected the account page to expose account actions from the summary card",
  );
  assert.ok(
    !source.includes("linear-gradient"),
    "expected the account page to avoid decorative gradient hero treatments",
  );
  assert.ok(
    !source.includes("signedInAs"),
    "expected the account page summary to stop duplicating identity details that already exist in the session card",
  );
});

void test("account session card keeps structured status sections and collapsible diagnostics", async () => {
  const source = await readFile(
    new URL("./account-session-card.tsx", import.meta.url),
    "utf8",
  );

  assert.ok(
    source.includes("StatusSection"),
    "expected the session card to keep structured status sections",
  );
  assert.ok(
    source.includes("Collapsible"),
    "expected diagnostics to be placed behind a collapsible",
  );
  assert.ok(
    source.includes("t.auth.browserPayload"),
    "expected diagnostics to remain localized",
  );
  assert.ok(
    source.includes("t.auth.bffConnection"),
    "expected the BFF section to remain present",
  );
});

void test("auth panel focuses on authentication instead of account-level language settings", async () => {
  const source = await readFile(
    new URL("./auth-panel.tsx", import.meta.url),
    "utf8",
  );

  assert.ok(
    !source.includes("changeLocale"),
    "expected the auth panel to stop changing locale directly",
  );
  assert.ok(
    !source.includes('authMode === "register" && "sm:grid-cols-2"'),
    "expected the registration fields to stay in a simple stacked layout",
  );
  assert.ok(
    source.includes("rounded-xl bg-muted p-1"),
    "expected the local auth mode switcher to use a compact segmented treatment",
  );
});
