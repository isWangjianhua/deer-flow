import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("bff thread stream only invokes onFinish once in the completion path", async () => {
  const source = await readFile(new URL("./hooks.ts", import.meta.url), "utf8");
  const onFinishCalls = source.match(/onFinish\?\.\(/g) ?? [];

  assert.equal(
    onFinishCalls.length,
    1,
    "expected useBffThreadStream to call onFinish in exactly one place",
  );
  assert.ok(
    !source.includes("Attachments are not supported in BFF chat yet."),
    "expected BFF chat to support attachments instead of rejecting them outright",
  );
  assert.ok(
    source.includes('uploadFiles(resolvedConversationId, files, { apiMode: "bff" })'),
    "expected BFF chat attachments to upload through the BFF conversation route",
  );
});
