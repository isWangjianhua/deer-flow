export interface ConversationSummary {
  conversation_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface UseChatBody {
  conversation_id?: string;
}
