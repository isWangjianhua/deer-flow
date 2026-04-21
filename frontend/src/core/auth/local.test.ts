import assert from "node:assert/strict";
import test from "node:test";

const {
  LOCAL_AUTH_EVENT,
  getBffLocalAuthCookieName,
  isLocalDevAuthMode,
  toLocalDevSession,
  writeLocalDevSession,
} = await import(new URL("./local.ts", import.meta.url).href);

void test("uses a stable cookie name for local bff auth", () => {
  assert.equal(getBffLocalAuthCookieName(), "deer-flow-local-bff-token");
});

void test("maps local auth mode from env-style config", () => {
  assert.equal(isLocalDevAuthMode({ NEXT_PUBLIC_AUTH_MODE: "local" }), true);
  assert.equal(isLocalDevAuthMode({ NEXT_PUBLIC_AUTH_MODE: "oidc" }), false);
  assert.equal(isLocalDevAuthMode({}), false);
});

void test("builds a synthetic browser session from a bff user payload", () => {
  const session = toLocalDevSession({
    id: "user-1",
    username: "demo",
    email: "demo@example.com",
  });

  assert.equal(session.user.id, "user-1");
  assert.equal(session.user.name, "demo");
  assert.equal(session.user.email, "demo@example.com");
  assert.equal(session.session.id, "local-dev-session");
});

void test("broadcasts local auth changes after persisting the session", () => {
  const originalWindow = globalThis.window;
  const storage = new Map<string, string>();
  const dispatched: string[] = [];
  const fakeWindow = Object.assign(new EventTarget(), {
    localStorage: {
      getItem(key: string) {
        return storage.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        storage.set(key, value);
      },
      removeItem(key: string) {
        storage.delete(key);
      },
      clear() {
        storage.clear();
      },
      key(index: number) {
        return [...storage.keys()][index] ?? null;
      },
      get length() {
        return storage.size;
      },
    } satisfies Storage,
  });

  fakeWindow.addEventListener(LOCAL_AUTH_EVENT, () => {
    dispatched.push(LOCAL_AUTH_EVENT);
  });

  globalThis.window = fakeWindow as typeof globalThis.window;

  const session = toLocalDevSession({
    id: "user-1",
    username: "demo",
    email: "demo@example.com",
  });

  writeLocalDevSession(session);

  assert.deepEqual(dispatched, [LOCAL_AUTH_EVENT]);
  assert.equal(storage.get("deer-flow-local-bff-token"), undefined);
  assert.ok(storage.has("deer-flow-local-bff-session"));

  globalThis.window = originalWindow;
});
