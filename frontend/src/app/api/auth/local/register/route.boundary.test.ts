import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("local register route proxies to the internal BFF registration endpoint", async () => {
  const source = await readFile(new URL("./route.ts", import.meta.url), "utf8");

  assert.ok(
    source.includes('fetch(`${getInternalBffBaseURL()}/auth/register`'),
    "expected the local register route to proxy to the internal BFF /auth/register endpoint",
  );
  assert.ok(
    source.includes("getBffLocalAuthCookieName"),
    "expected the local register route to reuse the local auth cookie name",
  );
  assert.ok(
    source.includes("toLocalDevSession"),
    "expected the local register route to reuse the local dev session mapper",
  );
});
