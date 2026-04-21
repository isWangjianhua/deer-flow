import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("browser auth exposes a local registration helper that persists the local session", async () => {
  const source = await readFile(new URL("./browser.ts", import.meta.url), "utf8");

  assert.ok(
    source.includes("export async function signUpWithLocalPassword"),
    "expected browser auth to export a local registration helper",
  );
  assert.ok(
    source.includes('fetch("/api/auth/local/register"'),
    "expected the local registration helper to call the register bridge route",
  );
  assert.ok(
    source.includes("writeLocalDevSession"),
    "expected the local registration helper to persist the returned local session",
  );
  assert.ok(
    !source.includes("payload.accessToken"),
    "expected local registration to stop handling browser-visible access tokens",
  );
});

void test("browser auth local sign-in no longer depends on access tokens from the bridge route", async () => {
  const source = await readFile(new URL("./browser.ts", import.meta.url), "utf8");

  assert.ok(
    !source.includes("accessToken?: string"),
    "expected local sign-in payload typing to stop declaring accessToken",
  );
  assert.ok(
    !source.includes("payload.accessToken"),
    "expected local sign-in to stop persisting access tokens from the bridge response",
  );
});

void test("browser auth listens for local auth session change events", async () => {
  const source = await readFile(new URL("./browser.ts", import.meta.url), "utf8");

  assert.ok(
    source.includes("LOCAL_AUTH_EVENT"),
    "expected browser auth to import the shared local auth change event",
  );
  assert.ok(
    source.includes('window.addEventListener(LOCAL_AUTH_EVENT, syncLocalSession)'),
    "expected browser auth to refresh local session state after same-tab sign-in",
  );
});

void test("browser auth surfaces nested BFF validation messages for local registration failures", async () => {
  const source = await readFile(new URL("./browser.ts", import.meta.url), "utf8");

  assert.ok(
    source.includes("detail?: { message?: string }"),
    "expected browser auth to understand nested BFF error payloads",
  );
  assert.ok(
    source.includes("payload.detail?.message"),
    "expected browser auth to surface the backend validation message instead of a generic registration failure",
  );
});
