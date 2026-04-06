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
type ToolCallPart = Extract<AssistantUiMessage["parts"][number], { type: "tool-call" }>;

function collectToolResultEvents(events: ChatStreamEvent[]) {
  const toolResults = new Map<string, ToolResultPart>();
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
    toolResults.set(toolCallId, {
      type: "tool-result",
      toolCallId,
      toolName: event.data.name ?? "tool",
      content,
    });
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

    const parts = [...message.parts];
    const resultIndexByCallId = new Map<string, number>();
    for (const [index, part] of parts.entries()) {
      if (part.type === "tool-result") {
        resultIndexByCallId.set(part.toolCallId, index);
      }
    }

    let insertOffset = 0;
    for (const [index, part] of message.parts.entries()) {
      if (part.type !== "tool-call") {
        continue;
      }

      const toolCall = part as ToolCallPart;
      const streamedResult = streamedToolResults.get(toolCall.toolCallId);
      if (!streamedResult) {
        continue;
      }

      const existingResultIndex = resultIndexByCallId.get(toolCall.toolCallId);
      if (existingResultIndex !== undefined) {
        const existing = parts[existingResultIndex] as ToolResultPart;
        if (!existing.content && streamedResult.content) {
          parts[existingResultIndex] = {
            ...existing,
            toolName: existing.toolName || streamedResult.toolName,
            content: streamedResult.content,
          };
        }
        continue;
      }

      parts.splice(index + 1 + insertOffset, 0, streamedResult);
      insertOffset += 1;
      resultIndexByCallId.set(toolCall.toolCallId, index + insertOffset);
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
