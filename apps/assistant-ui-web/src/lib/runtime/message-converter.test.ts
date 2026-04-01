import { describe, expect, it } from "vitest";

import {
  convertDeerFlowMessages,
  type AssistantUiMessage,
} from "./message-converter";

describe("message conversion", () => {
  it("maps human messages to user messages", () => {
    const messages = convertDeerFlowMessages([
      {
        id: "human_1",
        type: "human",
        content: "hello",
      },
    ]);

    expect(messages).toEqual<AssistantUiMessage[]>([
      {
        id: "human_1",
        role: "user",
        parts: [{ type: "text", text: "hello" }],
      },
    ]);
  });

  it("maps ai text messages to assistant text parts", () => {
    const messages = convertDeerFlowMessages([
      {
        id: "ai_1",
        type: "ai",
        content: "hello back",
      },
    ]);

    expect(messages).toEqual<AssistantUiMessage[]>([
      {
        id: "ai_1",
        role: "assistant",
        parts: [{ type: "text", text: "hello back" }],
      },
    ]);
  });

  it("maps ai tool_calls to assistant tool invocation parts", () => {
    const messages = convertDeerFlowMessages([
      {
        id: "ai_1",
        type: "ai",
        content: "",
        tool_calls: [
          {
            id: "call_1",
            name: "web_search",
            args: { query: "上海天气" },
          },
        ],
      },
    ]);

    expect(messages).toEqual<AssistantUiMessage[]>([
      {
        id: "ai_1",
        role: "assistant",
        parts: [
          {
            type: "tool-call",
            toolCallId: "call_1",
            toolName: "web_search",
            args: { query: "上海天气" },
          },
        ],
      },
    ]);
  });

  it("maps tool messages to tool result parts", () => {
    const messages = convertDeerFlowMessages([
      {
        id: "tool_1",
        type: "tool",
        tool_call_id: "call_1",
        name: "web_search",
        content: "{\"results\":[]}",
      },
    ]);

    expect(messages).toEqual<AssistantUiMessage[]>([
      {
        id: "tool_1",
        role: "assistant",
        parts: [
          {
            type: "tool-result",
            toolCallId: "call_1",
            toolName: "web_search",
            content: "{\"results\":[]}",
          },
        ],
      },
    ]);
  });

  it("maps reasoning content into hidden-step parts", () => {
    const messages = convertDeerFlowMessages([
      {
        id: "ai_1",
        type: "ai",
        content: "final answer",
        additional_kwargs: {
          reasoning_content: "need to search first",
        },
      },
    ]);

    expect(messages).toEqual<AssistantUiMessage[]>([
      {
        id: "ai_1",
        role: "assistant",
        parts: [
          {
            type: "reasoning",
            text: "need to search first",
          },
          {
            type: "text",
            text: "final answer",
          },
        ],
      },
    ]);
  });

  it("filters internal control messages", () => {
    const messages = convertDeerFlowMessages([
      {
        id: "ai_1",
        type: "ai",
        content: "[LOOP DETECTED] retrying",
      },
      {
        id: "human_1",
        type: "human",
        content: "real message",
      },
    ]);

    expect(messages).toEqual<AssistantUiMessage[]>([
      {
        id: "human_1",
        role: "user",
        parts: [{ type: "text", text: "real message" }],
      },
    ]);
  });
});
