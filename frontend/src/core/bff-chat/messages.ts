import type { Message } from "@langchain/langgraph-sdk";

import type { FileInMessage } from "@/core/messages/utils";

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

export function createHumanMessage(
  text: string,
  files?: FileInMessage[],
  id?: string,
): Message {
  return {
    type: "human",
    id: id ?? `bff-human-${Date.now()}`,
    content: [{ type: "text", text }],
    additional_kwargs: files && files.length > 0 ? { files } : undefined,
  };
}

export function toThreadMessages(
  chatState: BffChatState,
  humanMessages: Message[],
): Message[] {
  const assistantMessages = chatState.messages.flatMap<Message>(
    (assistantMessage) => {
      const messages: Message[] = [];
      const hasPreToolReasoning =
        assistantMessage.reasoning_before_tools.length > 0;
      const hasPostToolReasoning =
        assistantMessage.reasoning_after_tools.length > 0;
      const hasVisibleAssistantContent = hasPostToolReasoning
        ? true
        : assistantMessage.content.length > 0;

      if (hasPreToolReasoning && assistantMessage.tools.length > 0) {
        messages.push({
          type: "ai",
          id: `${assistantMessage.id}-reasoning-before-tools`,
          content: "",
          additional_kwargs: {
            reasoning_content: assistantMessage.reasoning_before_tools,
          },
        });
      }

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

      if (hasPostToolReasoning) {
        messages.push({
          type: "ai",
          id: `${assistantMessage.id}-reasoning-after-tools`,
          content: "",
          additional_kwargs: {
            reasoning_content: assistantMessage.reasoning_after_tools,
          },
        });
      }

      if (
        assistantMessage.content ||
        (!hasVisibleAssistantContent &&
          (assistantMessage.status === "streaming" ||
            assistantMessage.status === "completed")) ||
        messages.length === 0
      ) {
        messages.push({
          type: "ai",
          id: assistantMessage.id,
          content: assistantMessage.content,
          additional_kwargs:
            assistantMessage.tools.length === 0
              ? hasPreToolReasoning
                ? { reasoning_content: assistantMessage.reasoning_before_tools }
                : undefined
              : undefined,
        });
      }

      return messages;
    },
  );

  return [...humanMessages, ...assistantMessages];
}
