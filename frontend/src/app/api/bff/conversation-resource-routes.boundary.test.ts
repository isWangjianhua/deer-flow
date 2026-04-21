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
    source.includes("proxyAuthenticatedBffJson"),
    "expected suggestions proxy to enforce BFF auth through the shared BFF JSON proxy helper",
  );
});

void test("conversation detail route exposes rename and delete through the internal BFF", async () => {
  const source = await readFile(
    new URL("./conversations/[conversation_id]/route.ts", import.meta.url),
    "utf8",
  );

  assert.ok(
    source.includes("export async function PATCH"),
    "expected conversation detail route to expose a PATCH handler for rename",
  );
  assert.ok(
    source.includes("export async function DELETE"),
    "expected conversation detail route to expose a DELETE handler for hard delete",
  );
  assert.ok(
    source.includes("/conversations/${conversationId}"),
    "expected conversation detail route to proxy rename/delete/pin through the internal BFF conversation route",
  );
  assert.ok(
    source.includes('"PATCH"') && source.includes("await request.text()"),
    "expected the conversation detail route to forward generic patch payloads such as pin state",
  );
  assert.ok(
    source.includes("proxyAuthenticatedBffJson"),
    "expected the conversation detail route to reuse the shared BFF JSON proxy helper",
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
    source.includes("await request.arrayBuffer()"),
    "expected upload proxy to preserve the raw multipart body",
  );
  assert.ok(
    source.includes('request.headers.get("content-type")'),
    "expected upload proxy to forward the original multipart content-type",
  );
  assert.ok(
    source.includes("proxyAuthenticatedBffJson"),
    "expected uploads route to reuse the shared BFF JSON proxy helper",
  );
});

void test("conversation collection route reuses the shared BFF JSON proxy helper", async () => {
  const source = await readFile(
    new URL("./conversations/route.ts", import.meta.url),
    "utf8",
  );

  assert.ok(
    source.includes("proxyAuthenticatedBffJson"),
    "expected conversation collection route to reuse the shared BFF JSON proxy helper",
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

void test("conversation suggestions route reuses the shared BFF JSON proxy helper", async () => {
  const source = await readFile(
    new URL("./conversations/[conversation_id]/suggestions/route.ts", import.meta.url),
    "utf8",
  );

  assert.ok(
    source.includes("proxyAuthenticatedBffJson"),
    "expected suggestions route to reuse the shared BFF JSON proxy helper",
  );
});
