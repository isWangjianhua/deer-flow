import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("root app page redirects directly to a new chat", async () => {
  const source = await readFile(new URL("./page.tsx", import.meta.url), "utf8");

  assert.ok(
    source.includes('redirect(BFF_NEW_CHAT_PATH)'),
    "expected the root app page to redirect to the new chat route",
  );
  assert.ok(
    !source.includes("<Header />"),
    "expected the root app page not to render the landing page content anymore",
  );
});

void test("landing page remains available under /landing", async () => {
  const source = await readFile(new URL("./landing/page.tsx", import.meta.url), "utf8");

  assert.ok(
    source.includes("LandingPage"),
    "expected a dedicated /landing route to keep the landing page available",
  );
});
