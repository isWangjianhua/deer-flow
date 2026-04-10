import assert from "node:assert/strict";
import test from "node:test";

const { resolveStoredBrowserAuthSession } = await import(
  new URL("./browser-state.ts", import.meta.url).href,
);

void test("keeps stored browser auth pending before hydration completes", () => {
  const session = {
    session: { id: "session-1" },
    user: { id: "user-1", name: "demo", email: null },
  };

  const result = resolveStoredBrowserAuthSession({
    hydrated: false,
    session,
  });

  assert.deepEqual(result, {
    data: null,
    isPending: true,
    error: null,
  });
});

void test("returns stored browser auth session after hydration", () => {
  const session = {
    session: { id: "session-1" },
    user: { id: "user-1", name: "demo", email: null },
  };

  const result = resolveStoredBrowserAuthSession({
    hydrated: true,
    session,
  });

  assert.deepEqual(result, {
    data: session,
    isPending: false,
    error: null,
  });
});
