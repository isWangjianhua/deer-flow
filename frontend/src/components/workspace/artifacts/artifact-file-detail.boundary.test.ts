import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("artifact HTML preview renders from fetched content instead of direct artifact URL", async () => {
  const source = await readFile(
    new URL("./artifact-file-detail.tsx", import.meta.url),
    "utf8",
  );

  assert.ok(
    source.includes("URL.createObjectURL"),
    "expected HTML preview to build a blob URL from fetched artifact content",
  );
  assert.ok(
    source.includes('src={htmlPreviewUrl}'),
    "expected HTML preview iframe to use the generated blob URL",
  );
  assert.ok(
    !source.includes("isWriteFile ? { srcDoc: content } : url ? { src: url } : {}"),
    "expected HTML preview to avoid direct iframe src loading for stored artifacts",
  );
});
