import assert from "node:assert/strict";
import test from "node:test";

const { buildBffMeRequest } = await import(
  new URL("./bff.ts", import.meta.url).href,
);

void test("builds a proxied BFF /me request with a bearer id token", () => {
  const request = buildBffMeRequest({
    baseURL: "http://127.0.0.1:9000",
    idToken: "header.payload.signature",
  });

  assert.equal(request.url, "http://127.0.0.1:9000/me");
  assert.equal(
    request.init.headers instanceof Headers
      ? request.init.headers.get("authorization")
      : null,
    "Bearer header.payload.signature",
  );
});
