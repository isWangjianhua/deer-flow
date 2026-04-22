import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readSource(relativePath: string) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

void test("bff agents routes proxy authenticated requests to bff agent endpoints", async () => {
  const rootSource = await readSource("./route.ts");
  const checkSource = await readSource("./check/route.ts");
  const detailSource = await readSource("./[agent_name]/route.ts");

  for (const source of [rootSource, checkSource, detailSource]) {
    assert.ok(
      source.includes("proxyAuthenticatedBffJson"),
      "expected BFF agent routes to use the shared authenticated BFF proxy helper",
    );
  }

  assert.ok(
    rootSource.includes('path: "/agents"'),
    "expected the root route to proxy the BFF /agents endpoint",
  );
  assert.ok(
    rootSource.includes('method: "POST"'),
    "expected the root route to proxy POST requests to the BFF /agents endpoint",
  );
  assert.ok(
    checkSource.includes("/agents/check"),
    "expected the check route to proxy the BFF /agents/check endpoint",
  );
  assert.ok(
    checkSource.includes("request.nextUrl.searchParams.toString()"),
    "expected the check route to preserve the original query string",
  );
  assert.ok(
    detailSource.includes("const { agent_name: agentName } = await context.params;"),
    "expected the detail route to read the dynamic agent name from params",
  );
  assert.ok(
    detailSource.includes("path: `/agents/${agentName}`"),
    "expected the detail route to proxy the dynamic BFF /agents/{agent_name} endpoint",
  );
  assert.ok(
    detailSource.includes('method: "PUT"'),
    "expected the detail route to proxy PUT requests to the BFF agent endpoint",
  );
  assert.ok(
    detailSource.includes('method: "DELETE"'),
    "expected the detail route to proxy DELETE requests to the BFF agent endpoint",
  );
});
