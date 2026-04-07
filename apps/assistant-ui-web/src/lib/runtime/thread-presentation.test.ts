import { describe, expect, it } from "vitest";

import type { ChatStreamEvent } from "./chat-stream";
import type { AssistantUiMessage } from "./message-converter";
import { buildThreadPresentation } from "./thread-presentation";

describe("thread presentation", () => {
  it("produces a stable live assistant block while streaming text deltas", () => {
    const presentation = buildThreadPresentation([], [
      { type: "text-start", id: "live_1" },
      { type: "text-delta", id: "live_1", delta: "Hello" },
      { type: "text-delta", id: "live_1", delta: " world" },
    ]);

    expect(presentation.liveBlock?.body).toBe("Hello world");
  });

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

  it("keeps a live reasoning card updated from stream events", () => {
    const events: ChatStreamEvent[] = [
      {
        type: "data-reasoning",
        data: { messageId: "msg_live", content: "Inspecting the request" },
      },
      {
        type: "data-reasoning",
        data: { messageId: "msg_live", content: "Inspecting the request\nNeed a tool call next" },
      },
    ];

    const presentation = buildThreadPresentation([], events);

    expect(presentation.liveBlock?.events).toEqual([
      {
        id: "msg_live:reasoning:live",
        source: {
          messageId: "msg_live",
          partIndex: -1,
        },
        kind: "reasoning",
        title: "Reasoning",
        content: "Inspecting the request\nNeed a tool call next",
        status: "streaming",
      },
    ]);
  });

  it("keeps reasoning order interleaved with live tool calls", () => {
    const events: ChatStreamEvent[] = [
      {
        type: "data-tool-call",
        data: { toolCallId: "call_1", name: "web_search", args: { query: "上海天气" } },
      },
      {
        type: "data-reasoning",
        data: { messageId: "msg_live", content: "先看一眼搜索结果" },
      },
      {
        type: "data-tool-call",
        data: { toolCallId: "call_2", name: "web_fetch", args: { url: "https://example.com" } },
      },
    ];

    const presentation = buildThreadPresentation([], events);

    expect(presentation.liveBlock?.events.map((event) => event.id)).toEqual([
      "call_1",
      "msg_live:reasoning:live",
      "call_2",
    ]);
  });

  it("keeps an updated reasoning card before an already-rendered tool card", () => {
    const events: ChatStreamEvent[] = [
      {
        type: "data-reasoning",
        data: { messageId: "msg_live", content: "先分析一下" },
      },
      {
        type: "data-tool-call",
        data: { toolCallId: "call_1", name: "web_search", args: { query: "深圳天气" } },
      },
      {
        type: "data-reasoning",
        data: { messageId: "msg_live", content: "先分析一下\n然后搜索" },
      },
    ];

    const presentation = buildThreadPresentation([], events);

    expect(presentation.liveBlock?.events.map((event) => event.id)).toEqual([
      "msg_live:reasoning:live",
      "call_1",
    ]);
    expect(presentation.liveBlock?.events[0]).toMatchObject({
      kind: "reasoning",
      content: "先分析一下\n然后搜索",
    });
  });

  it("preserves separate tool cards when toolCallId repeats in live stream", () => {
    const events: ChatStreamEvent[] = [
      {
        type: "data-tool-call",
        data: { toolCallId: "call_1", name: "web_search", args: { query: "上海天气" } },
      },
      {
        type: "data-tool-result",
        data: { toolCallId: "call_1", name: "web_search", content: '{"results":[{"title":"结果A"}]}' },
      },
      {
        type: "data-tool-call",
        data: { toolCallId: "call_1", name: "web_search", args: { query: "北京天气" } },
      },
      {
        type: "data-tool-result",
        data: { toolCallId: "call_1", name: "web_search", content: '{"results":[{"title":"结果B"}]}' },
      },
    ];

    const presentation = buildThreadPresentation([], events);
    const toolCards = presentation.liveBlock?.events.filter((event) => event.kind === "tool") ?? [];

    expect(toolCards.map((event) => event.id)).toEqual(["call_1", "call_1__2"]);
    expect(toolCards.map((event) => event.content)).toEqual([
      '{"results":[{"title":"结果A"}]}',
      '{"results":[{"title":"结果B"}]}',
    ]);
  });

  it("does not apply stale repeated tool result to a new pending call with same toolCallId", () => {
    const events: ChatStreamEvent[] = [
      {
        type: "data-tool-call",
        data: { toolCallId: "call_1", name: "web_search", args: { query: "上海天气" } },
      },
      {
        type: "data-tool-result",
        data: { toolCallId: "call_1", name: "web_search", content: '{"results":[{"title":"结果A"}]}' },
      },
      {
        type: "data-tool-call",
        data: { toolCallId: "call_1", name: "web_search", args: { query: "北京天气" } },
      },
      {
        type: "data-tool-result",
        data: { toolCallId: "call_1", name: "web_search", content: '{"results":[{"title":"结果A"}]}' },
      },
      {
        type: "data-tool-result",
        data: { toolCallId: "call_1", name: "web_search", content: '{"results":[{"title":"结果B"}]}' },
      },
    ];

    const presentation = buildThreadPresentation([], events);
    const toolCards = presentation.liveBlock?.events.filter((event) => event.kind === "tool") ?? [];

    expect(toolCards.map((event) => event.id)).toEqual(["call_1", "call_1__2"]);
    expect(toolCards.map((event) => event.content)).toEqual([
      '{"results":[{"title":"结果A"}]}',
      '{"results":[{"title":"结果B"}]}',
    ]);
  });

  it("coalesces repeated live tool-call events for the same in-flight call", () => {
    const events: ChatStreamEvent[] = [
      {
        type: "data-tool-call",
        data: { toolCallId: "call_1", name: "web_search", args: {} },
      },
      {
        type: "data-tool-call",
        data: { toolCallId: "call_1", name: "web_search", args: { query: "成都明天天气预报 2026 年 4 月 8 日" } },
      },
      {
        type: "data-tool-result",
        data: {
          toolCallId: "call_1",
          name: "web_search",
          content: '{"results":[{"title":"成都天气预报"}]}',
        },
      },
    ];

    const presentation = buildThreadPresentation([], events);
    const toolCards = presentation.liveBlock?.events.filter((event) => event.kind === "tool") ?? [];

    expect(toolCards).toHaveLength(1);
    expect(toolCards[0]).toMatchObject({
      id: "call_1",
      args: { query: "成都明天天气预报 2026 年 4 月 8 日" },
      content: '{"results":[{"title":"成都天气预报"}]}',
      status: "done",
    });
  });

  it("exposes artifact paths for the right canvas", () => {
    const presentation = buildThreadPresentation([], [], ["/tmp/report.md"]);

    expect(presentation.canvas.items).toEqual(["/tmp/report.md"]);
    expect(presentation.blocks).toEqual([]);
    expect(presentation.liveBlock).toBeNull();
  });
});
