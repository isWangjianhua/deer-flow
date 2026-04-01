import {
  createConversation,
  deleteConversation,
  listAssistantUiThreads,
  updateConversation,
  type ConversationSummary,
  type AssistantUiThreadSummary,
} from "../conversations";

export type ThreadListItem = {
  threadId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

type ThreadListRuntimeDeps = {
  listThreads: typeof listAssistantUiThreads;
  createConversation: typeof createConversation;
  updateConversation: typeof updateConversation;
  deleteConversation: typeof deleteConversation;
};

function toThreadListItem(conversation: AssistantUiThreadSummary | ConversationSummary): ThreadListItem {
  const threadId =
    "thread_id" in conversation ? conversation.thread_id : conversation.conversation_id;

  return {
    threadId,
    title: conversation.title,
    createdAt: conversation.created_at,
    updatedAt: conversation.updated_at,
  };
}

export function createThreadListRuntime(deps: ThreadListRuntimeDeps = {
  listThreads: listAssistantUiThreads,
  createConversation,
  updateConversation,
  deleteConversation,
}) {
  return {
    async load(): Promise<ThreadListItem[]> {
      const conversations = await deps.listThreads();
      return conversations.map(toThreadListItem);
    },
    async create(title = ""): Promise<ThreadListItem> {
      const conversation = await deps.createConversation(title);
      return toThreadListItem(conversation);
    },
    async rename(threadId: string, title: string): Promise<ThreadListItem> {
      const conversation = await deps.updateConversation(threadId, title);
      return toThreadListItem(conversation);
    },
    async remove(threadId: string): Promise<void> {
      await deps.deleteConversation(threadId);
    },
  };
}
