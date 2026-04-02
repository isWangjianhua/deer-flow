import { describe, expect, it } from "vitest";

import type { ChatStreamEvent } from "./chat-stream";
import type { AssistantUiMessage } from "./message-converter";
import { buildThreadPresentation } from "./thread-presentation";

describe("thread presentation", () => {
  it("keeps assistant body text separate from reasoning and tool cards", () => {
    const messages: AssistantUiMessage[] = [
      {
        id: "assistant_1",
        role: "assistant",
        parts: [
          { type: "reasoning", text: "need to search first" },
          {
            type: "tool-call",
            toolCallId: "call_1",
            toolName: "web_search",
            args: { query: "Shanghai weather" },
          },
          {
            type: "tool-result",
            toolCallId: "call_1",
            toolName: "web_search",
            content: '{"results":[{"title":"Weather"}]}',
          },
          { type: "text", text: "Tomorrow will be cloudy." },
        ],
      },
    ];

    const presentation = buildThreadPresentation(messages, []);

    expect(presentation.blocks).toHaveLength(1);
    expect(presentation.blocks[0]).toMatchObject({
      id: "assistant_1",
      role: "assistant",
      body: "Tomorrow will be cloudy.",
      events: [
        { kind: "reasoning", id: "assistant_1:reasoning:0" },
        { kind: "tool", id: "call_1" },
      ],
    });
  });

  it("keeps live tool events inside cards while text deltas grow the assistant body", () => {
    const events: ChatStreamEvent[] = [
      { type: "text-start", id: "live_1" },
      {
        type: "data-tool-call",
        data: { toolCallId: "call_live", name: "read_file", args: { path: "README.md" } },
      },
      { type: "text-delta", id: "live_1", delta: "Reading the file now." },
      {
        type: "data-tool-result",
        data: { toolCallId: "call_live", name: "read_file", content: "# README" },
      },
    ];

    const presentation = buildThreadPresentation([], events);

    expect(presentation.liveBlock?.body).toBe("Reading the file now.");
    expect(presentation.liveBlock?.events.map((event) => event.id)).toEqual(["call_live"]);
  });

  it("passes canvas artifacts through separately from the message blocks", () => {
    const presentation = buildThreadPresentation([], [], ["artifact-a", "artifact-b"]);

    expect(presentation.canvas.items).toEqual(["artifact-a", "artifact-b"]);
    expect(presentation.blocks).toEqual([]);
    expect(presentation.liveBlock).toBeNull();
  });
});
