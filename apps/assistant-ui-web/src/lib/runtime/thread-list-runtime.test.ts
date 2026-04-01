import { describe, expect, it } from "vitest";

import { createThreadListRuntime } from "./thread-list-runtime";

describe("thread list runtime", () => {
  it("maps Gateway conversations into assistant-ui thread items", async () => {
    const runtime = createThreadListRuntime({
      listConversations: async () => [
        {
          conversation_id: "conv_1",
          title: "Chat A",
          created_at: "",
          updated_at: "",
        },
      ],
      createConversation: async (title = "") => ({
        conversation_id: "conv_new",
        title,
        created_at: "",
        updated_at: "",
      }),
      updateConversation: async (id, title) => ({
        conversation_id: id,
        title,
        created_at: "",
        updated_at: "",
      }),
      deleteConversation: async () => {},
    });

    const items = await runtime.load();

    expect(items[0]?.threadId).toBe("conv_1");
    expect(items[0]?.title).toBe("Chat A");
  });
});
