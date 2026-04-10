import assert from "node:assert/strict";
import test from "node:test";

const {
  getBffLocalAuthCookieName,
  getLocalBffHeaderName,
  isLocalDevAuthMode,
  toLocalDevSession,
} = await import(new URL("./local.ts", import.meta.url).href);

void test("uses a stable cookie name for local bff auth", () => {
  assert.equal(getBffLocalAuthCookieName(), "deer-flow-local-bff-token");
  assert.equal(getLocalBffHeaderName(), "x-deerflow-local-bff-token");
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
