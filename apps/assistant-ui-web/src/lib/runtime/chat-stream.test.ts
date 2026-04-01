import { afterEach, describe, expect, it, vi } from "vitest";

import { UnauthorizedError } from "../auth-errors";
import { collectChatStreamEvents, parseStreamFrame, streamChat } from "./chat-stream";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("chat stream", () => {
  it("parses a conversation data frame", () => {
    const event = parseStreamFrame(
      'data: {"type":"data-conversation","data":{"conversationId":"conv_1"}}\n\n',
    );

    expect(event).toEqual({
      type: "data-conversation",
      data: {
        conversationId: "conv_1",
      },
    });
  });

  it("parses tool-call and tool-result frames", async () => {
    const stream = [
      'data: {"type":"data-tool-call","data":{"toolCallId":"call_1","name":"web_search","args":{"query":"上海天气"}}}\n\n',
      'data: {"type":"data-tool-result","data":{"toolCallId":"call_1","name":"web_search","content":"{\\"results\\":[]}"}}\n\n',
      'data: {"type":"finish"}\n\n',
      "data: [DONE]\n\n",
    ];

    const events = await collectChatStreamEvents(stream);

    expect(events[0]).toEqual({
      type: "data-tool-call",
      data: {
        toolCallId: "call_1",
        name: "web_search",
        args: { query: "上海天气" },
      },
    });
    expect(events[1]).toEqual({
      type: "data-tool-result",
      data: {
        toolCallId: "call_1",
        name: "web_search",
        content: '{"results":[]}',
      },
    });
  });

  it("collects text deltas in order", async () => {
    const events = await collectChatStreamEvents([
      'data: {"type":"text-start","id":"text_1"}\n\n',
      'data: {"type":"text-delta","id":"text_1","delta":"Hello"}\n\n',
      'data: {"type":"text-delta","id":"text_1","delta":" world"}\n\n',
      'data: {"type":"text-end","id":"text_1"}\n\n',
      'data: {"type":"finish"}\n\n',
      "data: [DONE]\n\n",
    ]);

    expect(events.filter((event) => event.type === "text-delta")).toEqual([
      {
        type: "text-delta",
        id: "text_1",
        delta: "Hello",
      },
      {
        type: "text-delta",
        id: "text_1",
        delta: " world",
      },
    ]);
  });

  it("throws UnauthorizedError when chat returns 401", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("Authentication required", { status: 401 }),
    ) as typeof fetch;

    await expect(streamChat({ messages: [] })).rejects.toThrow(UnauthorizedError);
  });
});
