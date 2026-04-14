import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("sidebar skeleton avoids random widths during SSR render", async () => {
  const source = await readFile(new URL("./sidebar.tsx", import.meta.url), "utf8");

  assert.ok(
    !source.includes("Math.random()"),
    "expected sidebar skeleton rendering to avoid Math.random() so SSR hydration stays stable",
  );
});
