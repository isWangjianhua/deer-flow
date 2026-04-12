import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("workspace markdown content avoids direct heavy renderer imports", async () => {
  const source = await readFile(
    new URL("./markdown-content.tsx", import.meta.url),
    "utf8",
  );

  assert.ok(
    !source.includes('from "@/components/ai-elements/message"'),
    "expected markdown-content to avoid a static ai-elements/message import",
  );
  assert.ok(
    !source.includes('from "@/core/streamdown"'),
    "expected markdown-content to avoid a static streamdown plugin import",
  );
});

void test("message list items avoid direct katex and streamdown imports", async () => {
  const source = await readFile(
    new URL("./message-list-item.tsx", import.meta.url),
    "utf8",
  );

  assert.ok(
    !source.includes('from "rehype-katex"'),
    "expected message-list-item to avoid a static rehype-katex import",
  );
  assert.ok(
    !source.includes('from "@/components/ai-elements/message"'),
    "expected message-list-item to avoid a static ai-elements/message import",
  );
});
