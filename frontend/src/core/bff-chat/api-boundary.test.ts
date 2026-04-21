import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("bff chat api includes model context in stream requests", async () => {
  const source = await readFile(new URL("./api.ts", import.meta.url), "utf8");

  assert.ok(
    source.includes("context: input.context"),
    "expected bff stream API to forward context in the request body",
  );
  assert.ok(
    source.includes("model_name"),
    "expected bff stream API to support model_name forwarding",
  );
  assert.ok(
    source.includes("thinking_enabled"),
    "expected bff stream API to support thinking_enabled forwarding",
  );
  assert.ok(
    source.includes("reasoning_effort"),
    "expected bff stream API to support reasoning_effort forwarding",
  );
  assert.ok(
    !source.includes("readLocalBffAccessToken"),
    "expected bff chat API to stop reading browser-visible local auth tokens",
  );
  assert.ok(
    !source.includes("getLocalBffHeaderName"),
    "expected bff chat API to stop attaching custom local auth headers",
  );
});
