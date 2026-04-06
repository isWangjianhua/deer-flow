import { beforeEach, describe, expect, it, vi } from "vitest";

import { runConversationStream } from "./deerflow-runtime";
import type { ChatStreamEvent } from "./chat-stream";

const { streamChatMock, getThreadStateMock } = vi.hoisted(() => ({
  streamChatMock: vi.fn(),
  getThreadStateMock: vi.fn(),
}));

vi.mock("./chat-stream", () => ({
  streamChat: streamChatMock,
}));

vi.mock("../thread-state", () => ({
  getThreadState: getThreadStateMock,
}));

function toStream(events: ChatStreamEvent[]) {
  return (async function* () {
    for (const event of events) {
      yield event;
    }
  })();
}

describe("deerflow runtime stream", () => {
  beforeEach(() => {
    streamChatMock.mockReset();
    getThreadStateMock.mockReset();
  });

  it("returns canonical state without keeping live events after stream completion", async () => {
    const streamedEvents: ChatStreamEvent[] = [
      { type: "data-conversation", data: { conversationId: "thread_1" } },
      { type: "text-start", id: "text_1" },
      { type: "text-delta", id: "text_1", delta: "Hello" },
      { type: "text-end", id: "text_1" },
      { type: "finish" },
    ];

    streamChatMock.mockResolvedValue(toStream(streamedEvents));
    getThreadStateMock.mockResolvedValue({
      thread_id: "thread_1",
      title: "Chat",
      messages: [
        {
          id: "assistant_1",
          role: "assistant",
          parts: [{ type: "text", text: "Hello" }],
        },
      ],
      artifacts: [],
      todos: [],
    });

    const onEvent = vi.fn();
    const state = await runConversationStream({
      messages: [{ role: "user", content: "Hi" }],
      onEvent,
    });

    expect(onEvent).toHaveBeenCalledTimes(streamedEvents.length);
    expect(state.conversationId).toBe("thread_1");
    expect(state.messages).toHaveLength(1);
    expect(state.liveEvents).toEqual([]);
  });

  it("hydrates missing tool-result parts from streamed tool events", async () => {
    const streamedEvents: ChatStreamEvent[] = [
      { type: "data-conversation", data: { conversationId: "thread_1" } },
      {
        type: "data-tool-call",
        data: {
          toolCallId: "call_1",
          name: "web_search",
          args: { query: "北京天气" },
        },
      },
      {
        type: "data-tool-result",
        data: {
          toolCallId: "call_1",
          name: "web_search",
          content: '{"results":[{"title":"北京天气预报"}]}',
        },
      },
      { type: "finish" },
    ];

    streamChatMock.mockResolvedValue(toStream(streamedEvents));
    getThreadStateMock.mockResolvedValue({
      thread_id: "thread_1",
      title: "Chat",
      messages: [
        {
          id: "assistant_1",
          role: "assistant",
          parts: [
            {
              type: "tool-call",
              toolCallId: "call_1",
              toolName: "web_search",
              args: { query: "北京天气" },
            },
            { type: "text", text: "北京明天多云。" },
          ],
        },
      ],
      artifacts: [],
      todos: [],
    });

    const state = await runConversationStream({
      messages: [{ role: "user", content: "北京天气" }],
    });

    const assistantMessage = state.messages[0];
    expect(assistantMessage?.role).toBe("assistant");
    expect(assistantMessage?.parts).toEqual([
      {
        type: "tool-call",
        toolCallId: "call_1",
        toolName: "web_search",
        args: { query: "北京天气" },
      },
      {
        type: "tool-result",
        toolCallId: "call_1",
        toolName: "web_search",
        content: '{"results":[{"title":"北京天气预报"}]}',
      },
      { type: "text", text: "北京明天多云。" },
    ]);
    expect(state.liveEvents).toEqual([]);
  });

  it("hydrates multiple tool calls in order even when toolCallId repeats", async () => {
    const streamedEvents: ChatStreamEvent[] = [
      { type: "data-conversation", data: { conversationId: "thread_1" } },
      {
        type: "data-tool-result",
        data: {
          toolCallId: "call_1",
          name: "web_search",
          content: '{"results":[{"title":"结果A"}]}',
        },
      },
      {
        type: "data-tool-result",
        data: {
          toolCallId: "call_1",
          name: "web_search",
          content: '{"results":[{"title":"结果B"}]}',
        },
      },
      { type: "finish" },
    ];

    streamChatMock.mockResolvedValue(toStream(streamedEvents));
    getThreadStateMock.mockResolvedValue({
      thread_id: "thread_1",
      title: "Chat",
      messages: [
        {
          id: "assistant_1",
          role: "assistant",
          parts: [
            {
              type: "tool-call",
              toolCallId: "call_1",
              toolName: "web_search",
              args: { query: "上海天气" },
            },
            {
              type: "tool-call",
              toolCallId: "call_1",
              toolName: "web_search",
              args: { query: "北京天气" },
            },
          ],
        },
      ],
      artifacts: [],
      todos: [],
    });

    const state = await runConversationStream({
      messages: [{ role: "user", content: "天气" }],
    });

    expect(state.messages[0]?.parts).toEqual([
      {
        type: "tool-call",
        toolCallId: "call_1",
        toolName: "web_search",
        args: { query: "上海天气" },
      },
      {
        type: "tool-result",
        toolCallId: "call_1",
        toolName: "web_search",
        content: '{"results":[{"title":"结果A"}]}',
      },
      {
        type: "tool-call",
        toolCallId: "call_1",
        toolName: "web_search",
        args: { query: "北京天气" },
      },
      {
        type: "tool-result",
        toolCallId: "call_1",
        toolName: "web_search",
        content: '{"results":[{"title":"结果B"}]}',
      },
    ]);
  });
});
