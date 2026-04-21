import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("memory routes require authenticated BFF context and forward X-User-Id", async () => {
  const rootSource = await readFile(new URL("./route.ts", import.meta.url), "utf8");
  const nestedSource = await readFile(
    new URL("./[...path]/route.ts", import.meta.url),
    "utf8",
  );
  const proxySource = await readFile(new URL("./_proxy.ts", import.meta.url), "utf8");

  assert.ok(
    proxySource.includes("requireBffAuth"),
    "expected memory proxy to require authenticated BFF context",
  );
  assert.ok(
    proxySource.includes('headers.set("X-User-Id"'),
    "expected memory proxy to forward X-User-Id to Gateway",
  );
  assert.ok(
    proxySource.includes("buildBffMeRequest"),
    "expected memory proxy to resolve the authenticated BFF user via /me",
  );
  assert.ok(
    rootSource.includes('proxyMemoryRequest(request, "/api/memory")'),
    "expected the root memory route to proxy /api/memory through the shared helper",
  );
  assert.ok(
    nestedSource.includes('proxyMemoryRequest(request, `/api/memory/${(await params).path.join("/")}`)'),
    "expected nested memory routes to proxy child memory paths through the shared helper",
  );
});
