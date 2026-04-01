import {
  createConversation,
  deleteConversation,
  listConversations,
  updateConversation,
  type ConversationSummary,
} from "../conversations";

export type ThreadListItem = {
  threadId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

type ThreadListRuntimeDeps = {
  listConversations: typeof listConversations;
  createConversation: typeof createConversation;
  updateConversation: typeof updateConversation;
  deleteConversation: typeof deleteConversation;
};

function toThreadListItem(conversation: ConversationSummary): ThreadListItem {
  return {
    threadId: conversation.conversation_id,
    title: conversation.title,
    createdAt: conversation.created_at,
    updatedAt: conversation.updated_at,
  };
}

export function createThreadListRuntime(deps: ThreadListRuntimeDeps = {
  listConversations,
  createConversation,
  updateConversation,
  deleteConversation,
}) {
  return {
    async load(): Promise<ThreadListItem[]> {
      const conversations = await deps.listConversations();
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
