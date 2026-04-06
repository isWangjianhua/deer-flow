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

export async function runConversationStream(request: {
  conversationId?: string;
  messages: ChatRequestMessage[];
  modelName?: string;
  onEvent?: (event: ChatStreamEvent) => void;
}): Promise<DeerFlowRuntimeState> {
  let resolvedConversationId = request.conversationId ?? null;
  const stream = await streamChat({
    conversationId: request.conversationId,
    messages: request.messages,
    modelName: request.modelName,
  });

  for await (const event of stream) {
    if (event.type === "data-conversation" && event.data.conversationId) {
      resolvedConversationId = event.data.conversationId;
    }
    request.onEvent?.(event);
  }

  if (!resolvedConversationId) {
    throw new Error("Conversation id was not returned by the chat stream.");
  }

  return loadRuntimeState(resolvedConversationId);
}
