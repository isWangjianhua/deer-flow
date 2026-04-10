import type { AgentThreadState } from "@/core/threads";

import type { BffConversationDetail } from "./types";

export function toConversationThreadState(
  conversation: BffConversationDetail,
): AgentThreadState {
  return {
    title: conversation.values.title ?? conversation.title ?? "",
    messages: conversation.values.messages ?? [],
    artifacts: conversation.values.artifacts ?? [],
    todos: conversation.values.todos ?? [],
  };
}

export function mergeConversationMetadata(
  current: AgentThreadState,
  conversation: BffConversationDetail,
): AgentThreadState {
  return {
    ...current,
    title: conversation.values.title ?? conversation.title ?? current.title,
    artifacts: conversation.values.artifacts ?? current.artifacts,
    todos: conversation.values.todos ?? current.todos,
  };
}
