import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("loads Better Auth lazily from BFF auth routes", async () => {
  const source = await readFile(new URL("./auth.ts", import.meta.url), "utf8");

  assert.ok(
    source.includes('await import("@/server/better-auth")'),
    "expected BFF auth to lazy-load Better Auth",
  );
  assert.ok(
    !source.includes('from "@/server/better-auth"'),
    "expected BFF auth to avoid a static Better Auth import",
  );
});

void test("local BFF auth only trusts the HttpOnly cookie", async () => {
  const source = await readFile(new URL("./auth.ts", import.meta.url), "utf8");

  assert.ok(
    source.includes("request.cookies.get(getBffLocalAuthCookieName())?.value"),
    "expected local auth to read the HttpOnly cookie",
  );
  assert.ok(
    !source.includes("request.headers.get("),
    "expected local auth to stop accepting browser-supplied auth headers in local mode",
  );
});
