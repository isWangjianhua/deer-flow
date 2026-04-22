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
  assert.ok(
    source.includes("shouldClearPendingHumanMessages"),
    "expected useBffThreadStream to clear optimistic human messages once base messages arrive",
  );
  assert.ok(
    source.includes("const [isThreadLoading, setIsThreadLoading] = useState(") &&
      source.includes("conversationId != null"),
    "expected useBffThreadStream to start in loading mode when a conversation id is provided",
  );
  assert.ok(
    source.includes("setIsThreadLoading(!!nextConversationId)"),
    "expected useBffThreadStream to reset loading state while hydrating an existing conversation",
  );
  assert.ok(
    source.includes("createConversationForThread = createConversation"),
    "expected useBffThreadStream to default to generic createConversation for main chat",
  );
  assert.ok(
    source.includes("const created = await createConversationForThread()"),
    "expected useBffThreadStream to use an injectable conversation creator when auto-creating",
  );
});
