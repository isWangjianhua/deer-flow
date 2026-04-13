import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("rich markdown content normalizes rehype plugin lists before spreading", async () => {
  const source = await readFile(new URL("./markdown-content-rich.tsx", import.meta.url), "utf8");

  assert.ok(
    source.includes("const defaultRehypePlugins = defaults.rehypePlugins ?? [];"),
    "expected rehype defaults to be normalized before spreading",
  );
  assert.ok(
    source.includes("const extraRehypePlugins = rehypePlugins ?? [];"),
    "expected custom rehype plugins to be normalized before spreading",
  );
});
