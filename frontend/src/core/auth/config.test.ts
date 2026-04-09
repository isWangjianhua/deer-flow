import assert from "node:assert/strict";
import test from "node:test";

const { getBffBaseURL, getOidcProviderId } = await import(
  new URL("./config.ts", import.meta.url).href,
);

void test("defaults the BFF base URL to the same-origin proxy path", () => {
  assert.equal(getBffBaseURL(), "/api/bff");
});

void test("defaults the OIDC provider id to oidc", () => {
  assert.equal(getOidcProviderId(), "oidc");
});
