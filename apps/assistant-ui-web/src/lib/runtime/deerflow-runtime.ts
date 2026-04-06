import type { AssistantUiMessage } from "./message-converter";
import { streamChat, type ChatRequestMessage, type ChatStreamEvent } from "./chat-stream";

import { getThreadState } from "../thread-state";

export type DeerFlowRuntimeState = {
  conversationId: string | null;
  messages: AssistantUiMessage[];
  title: string;
  artifacts: string[];
  todos: unknown[];
  liveEvents: ChatStreamEvent[];
};

function normalizeRuntimeState(
  state: Partial<{
    thread_id: string | null;
    messages: AssistantUiMessage[];
    title: string | null;
    artifacts: string[] | null;
    todos: unknown[] | null;
  }>,
  fallbackConversationId: string | null,
): DeerFlowRuntimeState {
  return {
    conversationId: state.thread_id ?? fallbackConversationId,
    messages: state.messages ?? [],
    title: state.title ?? "",
    artifacts: state.artifacts ?? [],
    todos: state.todos ?? [],
    liveEvents: [],
  };
}

export async function loadRuntimeState(conversationId: string): Promise<DeerFlowRuntimeState> {
  const state = await getThreadState(conversationId);
  return normalizeRuntimeState(
    {
      thread_id: state.thread_id,
      messages: state.messages as AssistantUiMessage[],
      title: state.title,
      artifacts: state.artifacts,
      todos: state.todos,
    },
    conversationId,
  );
}

type ToolResultPart = Extract<AssistantUiMessage["parts"][number], { type: "tool-result" }>;

function collectToolResultEvents(events: ChatStreamEvent[]) {
  const toolResults = new Map<string, ToolResultPart[]>();
  for (const event of events) {
    if (event.type !== "data-tool-result") {
      continue;
    }
    const toolCallId = event.data.toolCallId;
    if (!toolCallId) {
      continue;
    }
    const content = typeof event.data.content === "string" ? event.data.content : "";
    if (!content) {
      continue;
    }
    const queue = toolResults.get(toolCallId) ?? [];
    queue.push({
      type: "tool-result",
      toolCallId,
      toolName: event.data.name ?? "tool",
      content,
    });
    toolResults.set(toolCallId, queue);
  }
  return toolResults;
}

function mergeMissingToolResults(messages: AssistantUiMessage[], events: ChatStreamEvent[]) {
  const streamedToolResults = collectToolResultEvents(events);
  if (streamedToolResults.size === 0) {
    return messages;
  }

  return messages.map((message) => {
    if (message.role !== "assistant") {
      return message;
    }

    const localQueues = new Map<string, ToolResultPart[]>();
    for (const [toolCallId, queue] of streamedToolResults.entries()) {
      localQueues.set(toolCallId, [...queue]);
    }

    const parts: AssistantUiMessage["parts"] = [];
    for (const [index, part] of message.parts.entries()) {
      if (part.type === "tool-result") {
        const queue = localQueues.get(part.toolCallId) ?? [];
        if (queue.length > 0) {
          const streamedResult = queue.shift();
          if (!streamedResult) {
            parts.push(part);
            continue;
          }
          parts.push(
            part.content
              ? part
              : {
                  ...part,
                  toolName: part.toolName || streamedResult.toolName,
                  content: streamedResult.content,
                },
          );
        } else {
          parts.push(part);
        }
        continue;
      }

      parts.push(part);
      if (part.type !== "tool-call") {
        continue;
      }

      const queue = localQueues.get(part.toolCallId) ?? [];
      if (queue.length === 0) {
        continue;
      }

      const streamedResult = queue.shift();
      if (!streamedResult) {
        continue;
      }
      const nextPart = message.parts[index + 1];
      const nextIsMatchingResult = Boolean(
        nextPart
          && nextPart.type === "tool-result"
          && nextPart.toolCallId === part.toolCallId,
      );
      if (!nextIsMatchingResult) {
        parts.push({
          ...streamedResult,
          toolName: streamedResult.toolName || part.toolName,
        });
      }
    }

    return {
      ...message,
      parts,
    };
  });
}

export async function runConversationStream(request: {
  conversationId?: string;
  messages: ChatRequestMessage[];
  modelName?: string;
  onEvent?: (event: ChatStreamEvent) => void;
}): Promise<DeerFlowRuntimeState> {
  let resolvedConversationId = request.conversationId ?? null;
  const streamedEvents: ChatStreamEvent[] = [];
  const stream = await streamChat({
    conversationId: request.conversationId,
    messages: request.messages,
    modelName: request.modelName,
  });

  for await (const event of stream) {
    streamedEvents.push(event);
    if (event.type === "data-conversation" && event.data.conversationId) {
      resolvedConversationId = event.data.conversationId;
    }
    request.onEvent?.(event);
  }

  if (!resolvedConversationId) {
    throw new Error("Conversation id was not returned by the chat stream.");
  }

  const canonicalState = await loadRuntimeState(resolvedConversationId);
  return {
    ...canonicalState,
    messages: mergeMissingToolResults(canonicalState.messages, streamedEvents),
    liveEvents: [],
  };
}
