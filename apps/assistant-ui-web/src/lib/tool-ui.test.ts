import { describe, expect, it } from "vitest";

import {
  extractCommandText,
  extractQuestionText,
  extractReadPath,
  parseSearchResults,
  truncateToolText,
} from "./tool-ui";

describe("tool ui helpers", () => {
  it("extracts common argument fields", () => {
    expect(extractReadPath({ file_path: "README.md" })).toBe("README.md");
    expect(extractReadPath({ path: "docs/spec.md" })).toBe("docs/spec.md");
    expect(extractCommandText({ command: "pytest -q" })).toBe("pytest -q");
    expect(extractCommandText({ cmd: "pnpm typecheck" })).toBe("pnpm typecheck");
    expect(extractQuestionText({ question: "Which file should I open?" }, "")).toBe(
      "Which file should I open?",
    );
  });

  it("falls back to tool content for clarification questions", () => {
    expect(extractQuestionText({}, "Need more context")).toBe("Need more context");
  });

  it("parses at most five web search results", () => {
    const payload = JSON.stringify({
      results: Array.from({ length: 7 }, (_, index) => ({
        title: `Result ${index + 1}`,
        url: `https://example.com/${index + 1}`,
      })),
    });

    expect(parseSearchResults(payload)).toHaveLength(5);
  });

  it("returns an empty list for invalid search payloads", () => {
    expect(parseSearchResults("not-json")).toEqual([]);
  });

  it("truncates long tool copy for compact metadata rows", () => {
    expect(truncateToolText("short text", 20)).toBe("short text");
    expect(truncateToolText("12345678901234567890tail", 12)).toBe("12345678901…");
  });
});
