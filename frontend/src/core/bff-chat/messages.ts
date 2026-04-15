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
      const reasoningSteps = assistantMessage.steps.filter(
        (step) => step.type === "reasoning",
      );
      const toolSteps = assistantMessage.steps.filter((step) => step.type === "tool");
      const hasToolSteps = toolSteps.length > 0;
      const hasVisibleAssistantContent =
        reasoningSteps.length > 0 ? true : assistantMessage.content.length > 0;

      for (const [index, step] of assistantMessage.steps.entries()) {
        if (step.type === "reasoning") {
          if (!hasToolSteps || !step.content) {
            continue;
          }

          messages.push({
            type: "ai",
            id: `${assistantMessage.id}-reasoning-${index}`,
            content: "",
            additional_kwargs: {
              reasoning_content: step.content,
            },
          });
          continue;
        }

        messages.push({
          type: "ai",
          id: `${assistantMessage.id}-${step.id}-tool-call`,
          content: "",
          tool_calls: [
            {
              id: step.id,
              name: step.name,
              args: step.args,
            },
          ],
        });

        messages.push({
          type: "tool",
          id: `${assistantMessage.id}-${step.id}-result`,
          name: step.name,
          tool_call_id: step.id,
          content: buildToolStatusSummary(step),
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
            !hasToolSteps
              ? reasoningSteps.length > 0
                ? {
                    reasoning_content: reasoningSteps
                      .map((step) => step.content)
                      .join(""),
                  }
                : undefined
              : undefined,
        });
      }

      return messages;
    },
  );

  return [...humanMessages, ...assistantMessages];
}
