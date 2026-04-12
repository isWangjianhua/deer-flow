import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readSource(relativePath: string) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

void test("memory API uses same-origin memory routes", async () => {
  const source = await readSource("./memory/api.ts");

  assert.ok(
    source.includes('fetch("/api/memory"'),
    "expected memory API to use the same-origin /api/memory route",
  );
  assert.ok(
    !source.includes("getBackendBaseURL"),
    "expected memory API to stop reading the raw backend base URL",
  );
});

void test("skills API uses same-origin skills routes", async () => {
  const source = await readSource("./skills/api.ts");

  assert.ok(
    source.includes('fetch("/api/skills"'),
    "expected skills API to use the same-origin /api/skills route",
  );
  assert.ok(
    !source.includes("getBackendBaseURL"),
    "expected skills API to stop reading the raw backend base URL",
  );
});

void test("agents API uses same-origin agents routes", async () => {
  const source = await readSource("./agents/api.ts");

  assert.ok(
    source.includes('fetch("/api/agents"'),
    "expected agents API to use the same-origin /api/agents route",
  );
  assert.ok(
    !source.includes("getBackendBaseURL"),
    "expected agents API to stop reading the raw backend base URL",
  );
});

void test("MCP API uses same-origin MCP routes", async () => {
  const source = await readSource("./mcp/api.ts");

  assert.ok(
    source.includes('fetch("/api/mcp/config"'),
    "expected MCP API to use the same-origin /api/mcp/config route",
  );
  assert.ok(
    !source.includes("getBackendBaseURL"),
    "expected MCP API to stop reading the raw backend base URL",
  );
});
