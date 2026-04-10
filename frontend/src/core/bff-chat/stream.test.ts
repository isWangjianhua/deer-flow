import assert from "node:assert/strict";
import test from "node:test";

const { createBffStreamDecoder, parseBffStreamChunk } = await import(
  new URL("./stream.ts", import.meta.url).href,
);

void test("parses a message delta event from SSE data", () => {
  const result = parseBffStreamChunk(
    'event: message.delta\ndata: {"message_id":"assistant-1","delta":"Hello"}\n\n',
  );

  assert.deepEqual(result, [
    {
      type: "message.delta",
      data: {
        message_id: "assistant-1",
        delta: "Hello",
      },
    },
  ]);
});

void test("parses tool lifecycle events from SSE data", () => {
  const result = parseBffStreamChunk(
    [
      "event: tool.started",
      'data: {"tool_call_id":"tool-1","label":"Searching web","name":"web_search","args":{"query":"weather"}}',
      "",
      "event: tool.completed",
      'data: {"tool_call_id":"tool-1"}',
      "",
    ].join("\n"),
  );

  assert.equal(result.length, 2);
  assert.equal(result[0]?.type, "tool.started");
  assert.equal(result[0]?.data.name, "web_search");
  assert.equal(result[1]?.type, "tool.completed");
});

void test("buffers partial SSE frames across chunks", () => {
  const decoder = createBffStreamDecoder();

  const first = decoder.push(
    'event: message.delta\ndata: {"message_id":"assistant-1",',
  );
  const second = decoder.push('"delta":"Hel');
  const third = decoder.push('lo"}\n\n');

  assert.deepEqual(first, []);
  assert.deepEqual(second, []);
  assert.deepEqual(third, [
    {
      type: "message.delta",
      data: {
        message_id: "assistant-1",
        delta: "Hello",
      },
    },
  ]);
});
