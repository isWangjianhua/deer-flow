import type { Message } from "@langchain/langgraph-sdk";

import type { BffChatState } from "./types";

function buildToolStatusSummary(
  tool: BffChatState["messages"][number]["tools"][number],
): string {
  if (tool.summary) {
    return tool.summary;
  }
  if (tool.status === "completed") {
    return "Completed";
  }
  if (tool.status === "failed") {
    return "Failed";
  }
  return "Running";
}

export function createHumanMessage(text: string): Message {
  return {
    type: "human",
    id: `bff-human-${Date.now()}`,
    content: [{ type: "text", text }],
  };
}

export function toThreadMessages(
  chatState: BffChatState,
  humanMessages: Message[],
): Message[] {
  const assistantMessages = chatState.messages.flatMap<Message>(
    (assistantMessage) => {
      const messages: Message[] = [];

      if (assistantMessage.tools.length > 0) {
        messages.push({
          type: "ai",
          id: `${assistantMessage.id}-tools`,
          content: "",
          tool_calls: assistantMessage.tools.map((tool) => ({
            id: tool.id,
            name: tool.name,
            args:
              tool.args.description === undefined
                ? {
                    ...tool.args,
                    description: tool.label,
                  }
                : tool.args,
          })),
        });

        for (const tool of assistantMessage.tools) {
          messages.push({
            type: "tool",
            id: `${assistantMessage.id}-${tool.id}-result`,
            name: tool.name,
            tool_call_id: tool.id,
            content: buildToolStatusSummary(tool),
          });
        }
      }

      if (
        assistantMessage.content ||
        assistantMessage.status === "streaming" ||
        assistantMessage.status === "completed" ||
        messages.length === 0
      ) {
        messages.push({
          type: "ai",
          id: assistantMessage.id,
          content: assistantMessage.content,
        });
      }

      return messages;
    },
  );

  return [...humanMessages, ...assistantMessages];
}
