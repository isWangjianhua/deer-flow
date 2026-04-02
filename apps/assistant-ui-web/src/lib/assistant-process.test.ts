import { describe, expect, it } from "vitest";

import { buildAssistantProcessSummary } from "./assistant-process";

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
});
