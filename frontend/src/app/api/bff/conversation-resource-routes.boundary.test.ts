import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("conversation suggestions route proxies to the internal BFF", async () => {
  const source = await readFile(
    new URL("./conversations/[conversation_id]/suggestions/route.ts", import.meta.url),
    "utf8",
  );

  assert.ok(
    source.includes("/conversations/${conversationId}/suggestions"),
    "expected suggestions to proxy through the internal BFF conversation route",
  );
  assert.ok(
    source.includes("requireBffAuth"),
    "expected suggestions proxy to enforce BFF auth",
  );
});

void test("conversation uploads route proxies to the internal BFF", async () => {
  const source = await readFile(
    new URL("./conversations/[conversation_id]/uploads/route.ts", import.meta.url),
    "utf8",
  );

  assert.ok(
    source.includes("/conversations/${conversationId}/uploads"),
    "expected uploads to proxy through the internal BFF conversation route",
  );
  assert.ok(
    source.includes("await request.formData()"),
    "expected upload proxy to forward multipart form data",
  );
});

void test("conversation artifact route proxies to the internal BFF", async () => {
  const source = await readFile(
    new URL("./conversations/[conversation_id]/artifacts/[...path]/route.ts", import.meta.url),
    "utf8",
  );

  assert.ok(
    source.includes(
      "/conversations/${conversationId}/artifacts/${artifactPath}${request.nextUrl.search}",
    ),
    "expected artifacts to proxy through the internal BFF conversation route",
  );
  assert.ok(
    source.includes("request.nextUrl.search"),
    "expected artifact proxy to preserve download query parameters",
  );
});
