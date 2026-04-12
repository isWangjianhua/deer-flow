import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readSource(relativePath: string) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

void test("skills route proxies to gateway skills endpoints", async () => {
  const source = await readSource("./skills/[...path]/route.ts");

  assert.ok(
    source.includes('return proxyGatewayRequest(request, `/api/skills/${(await params).path.join("/")}`);'),
    "expected skills route to proxy nested skills paths through the shared gateway proxy",
  );
});

void test("agents route proxies root and nested agent endpoints", async () => {
  const rootSource = await readSource("./agents/route.ts");
  const nestedSource = await readSource("./agents/[...path]/route.ts");

  assert.ok(
    rootSource.includes('return proxyGatewayRequest(request, "/api/agents");'),
    "expected agents root route to proxy the /api/agents endpoint",
  );
  assert.ok(
    nestedSource.includes('return proxyGatewayRequest(request, `/api/agents/${(await params).path.join("/")}`);'),
    "expected agents nested route to proxy child agent paths",
  );
});

void test("MCP route proxies nested MCP endpoints", async () => {
  const source = await readSource("./mcp/[...path]/route.ts");

  assert.ok(
    source.includes('return proxyGatewayRequest(request, `/api/mcp/${(await params).path.join("/")}`);'),
    "expected MCP route to proxy nested MCP paths through the shared gateway proxy",
  );
});
