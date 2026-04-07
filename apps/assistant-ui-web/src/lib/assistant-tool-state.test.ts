import { describe, expect, it } from "vitest";

import { isToolResultStreaming } from "./assistant-tool-state";

describe("assistant tool state", () => {
  it("treats a tool as finished once a result exists even if status still says running", () => {
    expect(isToolResultStreaming("running", true, true)).toBe(false);
    expect(isToolResultStreaming("pending", true, true)).toBe(false);
  });

  it("keeps a tool running while streaming when no result exists", () => {
    expect(isToolResultStreaming(undefined, false, true)).toBe(true);
    expect(isToolResultStreaming("running", false, true)).toBe(true);
  });
});
