import assert from "node:assert/strict";
import test from "node:test";

const { shouldClearPendingHumanMessages } = await import(
  new URL("./optimistic.ts", import.meta.url).href,
);

void test("clears pending human messages once the server has added new base messages", () => {
  assert.equal(
    shouldClearPendingHumanMessages({
      pendingHumanMessages: 1,
      baseMessageCount: 1,
      previousBaseMessageCount: 0,
    }),
    true,
  );
});

void test("keeps pending human messages when the base message count has not grown yet", () => {
  assert.equal(
    shouldClearPendingHumanMessages({
      pendingHumanMessages: 1,
      baseMessageCount: 3,
      previousBaseMessageCount: 3,
    }),
    false,
  );
});

void test("does not clear pending human messages when none are pending", () => {
  assert.equal(
    shouldClearPendingHumanMessages({
      pendingHumanMessages: 0,
      baseMessageCount: 5,
      previousBaseMessageCount: 4,
    }),
    false,
  );
});
