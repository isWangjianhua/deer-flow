import assert from "node:assert/strict";
import test from "node:test";

const { getOidcIdTokenFromAccount } = await import(
  new URL("./account.ts", import.meta.url).href,
);

void test("extracts an id_token from the Better Auth account payload", () => {
  const token = getOidcIdTokenFromAccount({
    providerId: "oidc",
    idToken: "header.payload.signature",
  });

  assert.equal(token, "header.payload.signature");
});

void test("returns null when the account payload does not include an id token", () => {
  const token = getOidcIdTokenFromAccount({
    providerId: "oidc",
  });

  assert.equal(token, null);
});

void test("returns null when the account payload belongs to another provider", () => {
  const token = getOidcIdTokenFromAccount({
    providerId: "github",
    idToken: "header.payload.signature",
  });

  assert.equal(token, null);
});
