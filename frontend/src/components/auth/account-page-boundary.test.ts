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
    source.includes("radial-gradient"),
    "expected the account page hero to use an intentional visual treatment",
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

void test("auth panel keeps direct language switching on the account surface", async () => {
  const source = await readFile(
    new URL("./auth-panel.tsx", import.meta.url),
    "utf8",
  );

  assert.ok(
    source.includes("SelectTrigger"),
    "expected the auth panel to expose the language switcher directly",
  );
  assert.ok(
    source.includes("signedInReadyTitle"),
    "expected the auth panel to support an authenticated page state",
  );
});
