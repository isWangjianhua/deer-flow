import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("bff chat page owns follow-up suggestion generation", async () => {
  const source = await readFile(new URL("./chat-page.tsx", import.meta.url), "utf8");

  assert.ok(
    source.includes("useMutation"),
    "expected BffChatPageContent to use a mutation for follow-up suggestions",
  );
  assert.ok(
    source.includes("generateSuggestions"),
    "expected BffChatPageContent to call the BFF suggestions API helper",
  );
  assert.ok(
    source.includes("externalFollowups={followupSuggestions}"),
    "expected BffChatPageContent to pass externally managed follow-ups into InputBox",
  );
  assert.ok(
    source.includes("externalFollowupsLoading={followupLoading}"),
    "expected BffChatPageContent to pass the external follow-up loading state into InputBox",
  );
  assert.ok(
    source.includes("externalFollowupsRequestId={followupRequestId}"),
    "expected BffChatPageContent to reset InputBox visibility from an explicit follow-up request id",
  );
});
