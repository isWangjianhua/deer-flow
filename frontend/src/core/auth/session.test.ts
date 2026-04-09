import assert from "node:assert/strict";
import test from "node:test";

const { toAuthSessionState } = await import(
  new URL("./session.ts", import.meta.url).href,
);

void test("normalizes an authenticated Better Auth session", () => {
  const state = toAuthSessionState({
    data: {
      session: { id: "session-1" },
      user: { id: "user-1", email: "demo@example.com", name: "Demo" },
    },
    isPending: false,
    error: null,
  });

  assert.equal(state.status, "authenticated");
  assert.equal(state.user?.email, "demo@example.com");
});

void test("normalizes an unauthenticated state", () => {
  const state = toAuthSessionState({
    data: null,
    isPending: false,
    error: null,
  });

  assert.equal(state.status, "unauthenticated");
  assert.equal(state.user, null);
});

void test("keeps loading state when the Better Auth hook is still pending", () => {
  const state = toAuthSessionState({
    data: null,
    isPending: true,
    error: null,
  });

  assert.equal(state.status, "loading");
});
