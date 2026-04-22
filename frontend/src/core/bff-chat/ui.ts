export const BFF_NEW_CHAT_PATH = "/workspace/chats/new";
export const BFF_NEW_CHAT_LEGACY_PATH = "/workspace/chat/new";

export function isBffChatRoute(pathname: string) {
  return (
    pathname === "/workspace/chats" ||
    pathname === BFF_NEW_CHAT_PATH ||
    pathname === BFF_NEW_CHAT_LEGACY_PATH ||
    /^\/workspace\/chats\/[^/]+$/.test(pathname)
  );
}

export function pathOfConversation(conversation: {
  id: string;
  agent_name?: string | null;
}) {
  return conversation.agent_name
    ? `/workspace/agents/${conversation.agent_name}/chats/${conversation.id}`
    : `/workspace/chats/${conversation.id}`;
}
