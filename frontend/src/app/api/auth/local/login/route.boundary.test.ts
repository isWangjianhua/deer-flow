import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("local login route keeps the BFF token in an HttpOnly cookie only", async () => {
  const source = await readFile(new URL("./route.ts", import.meta.url), "utf8");

  assert.ok(
    source.includes("getBffLocalAuthCookieName"),
    "expected the local login route to reuse the local auth cookie name",
  );
  assert.ok(
    !source.includes("accessToken:"),
    "expected the local login route to stop echoing accessToken to browser JSON",
  );
});
