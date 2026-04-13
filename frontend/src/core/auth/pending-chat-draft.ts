"use client";

const STORAGE_KEY = "deer-flow:pending-chat-auth-draft";

type PersistedPendingChatDraft = {
  path: string;
  text: string;
};

function canUseSessionStorage() {
  return typeof window !== "undefined";
}

export function persistPendingChatDraft(draft: PersistedPendingChatDraft) {
  if (!canUseSessionStorage()) {
    return;
  }

  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
}

export function consumePendingChatDraft(path: string): string | null {
  if (!canUseSessionStorage()) {
    return null;
  }

  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  window.sessionStorage.removeItem(STORAGE_KEY);

  try {
    const parsed = JSON.parse(raw) as Partial<PersistedPendingChatDraft>;
    if (parsed.path !== path || typeof parsed.text !== "string") {
      return null;
    }
    return parsed.text;
  } catch {
    return null;
  }
}
