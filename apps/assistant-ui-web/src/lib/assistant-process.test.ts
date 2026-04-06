import { describe, expect, it } from "vitest";

import {
  buildAssistantProcessSummary,
  collectAssistantProcessEntries,
} from "./assistant-process";

describe("assistant process summary", () => {
  it("uses the latest live step while streaming", () => {
    expect(
      buildAssistantProcessSummary(
        [
          { kind: "reasoning", title: "Thinking" },
          { kind: "tool", title: "Web Search" },
          { kind: "tool", title: "Web Fetch" },
        ],
        true,
      ),
    ).toBe("Using Web Fetch · 3 steps");
  });

  it("collapses to a tool summary when finished", () => {
    expect(
      buildAssistantProcessSummary(
        [
          { kind: "reasoning", title: "Thinking" },
          { kind: "tool", title: "Web Search" },
          { kind: "reasoning", title: "Thinking" },
          { kind: "tool", title: "Web Fetch" },
        ],
        false,
      ),
    ).toBe("Web Search, Web Fetch · 4 steps");
  });

  it("falls back to thought counts when no tools were used", () => {
    expect(
      buildAssistantProcessSummary(
        [
          { kind: "reasoning", title: "Thinking" },
          { kind: "reasoning", title: "Thinking" },
        ],
        false,
      ),
    ).toBe("2 thought steps");
  });

  it("preserves reasoning and tool order for rendering", () => {
    expect(
      collectAssistantProcessEntries(
        [
          { type: "reasoning", text: "先检查需求" },
          { type: "tool-call", toolName: "web_search" },
          { type: "reasoning", text: "比较结果" },
          { type: "tool-call", toolName: "web_fetch" },
          { type: "text" },
        ],
        false,
      ),
    ).toEqual([
      { kind: "reasoning", text: "先检查需求" },
      { kind: "tool", toolName: "web_search", args: undefined, argsText: undefined, result: undefined, status: undefined },
      { kind: "reasoning", text: "比较结果" },
      { kind: "tool", toolName: "web_fetch", args: undefined, argsText: undefined, result: undefined, status: undefined },
    ]);
  });

  it("drops empty finished reasoning entries", () => {
    expect(
      collectAssistantProcessEntries(
        [
          { type: "reasoning", text: "   " },
          { type: "tool-call", toolName: "web_search" },
        ],
        false,
      ),
    ).toEqual([
      { kind: "tool", toolName: "web_search", args: undefined, argsText: undefined, result: undefined, status: undefined },
    ]);
  });
});
