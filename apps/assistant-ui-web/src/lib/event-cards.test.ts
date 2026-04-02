import { describe, expect, it } from "vitest";

import {
  getReasoningSummary,
  getToolDisplayName,
  getToolStatusLabel,
  getToolSummary,
} from "./event-cards";

describe("event card helpers", () => {
  it("compresses reasoning text into a single readable summary line", () => {
    expect(
      getReasoningSummary("First inspect the repository.\nThen compare the previous thread state."),
    ).toBe("First inspect the repository.");
  });

  it("builds specific summaries for supported tools", () => {
    expect(getToolSummary("web_search", { query: "assistant-ui shadcn" })).toBe(
      "Query: assistant-ui shadcn",
    );
    expect(getToolSummary("read_file", { path: "README.md" })).toBe("File: README.md");
    expect(getToolSummary("run_command", { command: "pytest -q" })).toBe(
      "Command: pytest -q",
    );
    expect(getToolSummary("ask_clarification", { question: "Which branch should I use?" })).toBe(
      "Question: Which branch should I use?",
    );
  });

  it("falls back to a generic summary when tool args are missing", () => {
    expect(getToolSummary("unknown_tool", {})).toBe("Waiting for tool output");
    expect(getToolSummary("unknown_tool", {}, "done")).toBe("Output available");
  });

  it("formats tool display names and status labels", () => {
    expect(getToolDisplayName("web_search")).toBe("Web Search");
    expect(getToolDisplayName("run_command")).toBe("Run Command");
    expect(getToolStatusLabel(undefined)).toBe("Running");
    expect(getToolStatusLabel("output")).toBe("Done");
  });
});
