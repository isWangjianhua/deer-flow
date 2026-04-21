import assert from "node:assert/strict";
import test from "node:test";

const { loadBffUser } = await import(new URL("./bff-user.ts", import.meta.url).href);

void test("loads the current BFF user from the same-origin bridge route", async () => {
  const user = await loadBffUser(async (input, init) => {
    assert.equal(input, "/api/bff/me");
    assert.equal(init?.headers, undefined);

    return new Response(JSON.stringify({ id: "user-1", email: "demo@example.com" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });

  assert.deepEqual(user, {
    id: "user-1",
    email: "demo@example.com",
  });
});

void test("throws the upstream message when the BFF bridge returns an error", async () => {
  await assert.rejects(
    () =>
      loadBffUser(async () =>
        new Response(
          JSON.stringify({
            code: "missing_oidc_token",
            message: "OIDC token unavailable",
          }),
          {
            status: 401,
            headers: { "content-type": "application/json" },
          },
        ),
      ),
    /OIDC token unavailable/,
  );
});
