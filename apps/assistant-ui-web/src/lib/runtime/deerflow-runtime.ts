import { convertDeerFlowMessages, type AssistantUiMessage } from "./message-converter";
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

export async function loadRuntimeState(conversationId: string): Promise<DeerFlowRuntimeState> {
  const state = await getThreadState(conversationId);
  return {
    conversationId,
    messages: convertDeerFlowMessages(state.messages as Parameters<typeof convertDeerFlowMessages>[0]),
    title: state.title,
    artifacts: state.artifacts,
    todos: state.todos,
    liveEvents: [],
  };
}

export async function runConversationStream(request: {
  conversationId?: string;
  messages: ChatRequestMessage[];
  onEvent?: (event: ChatStreamEvent) => void;
}): Promise<DeerFlowRuntimeState> {
  let resolvedConversationId = request.conversationId ?? null;
  const liveEvents: ChatStreamEvent[] = [];
  const stream = await streamChat({
    conversationId: request.conversationId,
    messages: request.messages,
  });

  for await (const event of stream) {
    liveEvents.push(event);
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
    liveEvents,
  };
}
