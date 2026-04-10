export const BFF_NEW_CHAT_PATH = "/workspace/chat/new";
export const BFF_NEW_CHAT_LEGACY_PATH = "/workspace/chats/new";

export function isBffChatRoute(pathname: string) {
  return (
    pathname === "/workspace/chats" ||
    pathname === BFF_NEW_CHAT_PATH ||
    pathname === BFF_NEW_CHAT_LEGACY_PATH ||
    /^\/workspace\/chats\/[^/]+$/.test(pathname)
  );
}
