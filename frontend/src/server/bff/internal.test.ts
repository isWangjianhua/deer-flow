import assert from "node:assert/strict";
import test from "node:test";

const { getInternalBffBaseURL } = await import(
  new URL("./internal.ts", import.meta.url).href,
);

void test("prefers the internal BFF base URL when configured", () => {
  assert.equal(
    getInternalBffBaseURL({
      DEER_FLOW_INTERNAL_BFF_BASE_URL: "http://127.0.0.1:9000/",
      NEXT_PUBLIC_BFF_BASE_URL: "/api/bff",
    }),
    "http://127.0.0.1:9000",
  );
});

void test("falls back to an absolute NEXT_PUBLIC_BFF_BASE_URL", () => {
  assert.equal(
    getInternalBffBaseURL({
      NEXT_PUBLIC_BFF_BASE_URL: "https://bff.example.com/api",
    }),
    "https://bff.example.com/api",
  );
});

void test("defaults to localhost BFF when no absolute URL is configured", () => {
  assert.equal(
    getInternalBffBaseURL({
      NEXT_PUBLIC_BFF_BASE_URL: "/api/bff",
    }),
    "http://127.0.0.1:9000",
  );
});
