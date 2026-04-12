import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("message list items do not render a second empty assistant loading indicator", async () => {
  const source = await readFile(
    new URL("./message-list-item.tsx", import.meta.url),
    "utf8",
  );

  assert.ok(
    !source.includes("t.common.thinking"),
    "expected assistant loading text to stay out of message-list-item",
  );
  assert.ok(
    !source.includes("!isHuman && isLoading && !contentToDisplay"),
    "expected message-list-item to avoid a duplicate empty-state loading branch",
  );
});
