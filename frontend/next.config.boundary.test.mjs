import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("next dev rewrites proxy backend model and thread APIs", async () => {
  const source = await readFile(new URL("./next.config.js", import.meta.url), "utf8");

  assert.match(source, /source:\s*"\/api\/models"/);
  assert.match(source, /destination:\s*`\$\{gatewayURL\}\/api\/models`/);
  assert.match(source, /source:\s*"\/api\/threads\/:path\*"/);
  assert.match(source, /destination:\s*`\$\{gatewayURL\}\/api\/threads\/:path\*`/);
});
