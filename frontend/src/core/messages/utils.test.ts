import assert from "node:assert/strict";
import test from "node:test";

const { groupMessages } = await import(new URL("./utils.ts", import.meta.url).href);

void test("keeps the last empty assistant message visible during tool-driven streaming", () => {
  const messages = [
    {
      type: "ai",
      id: "assistant-tools",
      content: "",
      tool_calls: [
        {
          id: "tool-1",
          name: "bff_tool",
          args: { description: "web_search" },
        },
      ],
    },
    {
      type: "tool",
      id: "assistant-tool-result",
      name: "bff_tool",
      tool_call_id: "tool-1",
      content: "Running",
    },
    {
      type: "ai",
      id: "assistant-final",
      content: "",
    },
  ];

  const groups = groupMessages(messages as never, (group) => group);

  assert.equal(groups.length, 2);
  assert.equal(groups[0]?.type, "assistant:processing");
  assert.equal(groups[1]?.type, "assistant");
  assert.equal(groups[1]?.messages[0]?.id, "assistant-final");
});
