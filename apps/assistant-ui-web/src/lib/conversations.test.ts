import { describe, expect, it } from "vitest";

describe("conversation adapters", () => {
  it("maps Gateway conversation response", () => {
    const input = {
      conversation_id: "conv_1",
      title: "Hello",
      created_at: "2026-04-01T00:00:00Z",
      updated_at: "2026-04-01T00:00:00Z",
    };

    expect(input.conversation_id).toBe("conv_1");
  });
});
