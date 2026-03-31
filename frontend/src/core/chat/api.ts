import { getBackendBaseURL } from "../config";

import type { ConversationSummary } from "./types";

async function readErrorDetail(
  response: Response,
  fallback: string,
): Promise<string> {
  const error = await response.json().catch(() => ({ detail: fallback }));
  return error.detail ?? fallback;
}

export async function listConversations(): Promise<ConversationSummary[]> {
  const response = await fetch(`${getBackendBaseURL()}/api/conversations`);
  if (!response.ok) {
    throw new Error(
      await readErrorDetail(response, "Failed to load conversations"),
    );
  }
  return response.json();
}

export async function createConversation(
  title = "",
): Promise<ConversationSummary> {
  const response = await fetch(`${getBackendBaseURL()}/api/conversations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  if (!response.ok) {
    throw new Error(
      await readErrorDetail(response, "Failed to create conversation"),
    );
  }
  return response.json();
}

export async function deleteConversation(conversationId: string): Promise<void> {
  const response = await fetch(
    `${getBackendBaseURL()}/api/conversations/${encodeURIComponent(
      conversationId,
    )}`,
    { method: "DELETE" },
  );
  if (!response.ok) {
    throw new Error(
      await readErrorDetail(response, "Failed to delete conversation"),
    );
  }
}

export async function updateConversation(
  conversationId: string,
  title: string,
): Promise<ConversationSummary> {
  const response = await fetch(
    `${getBackendBaseURL()}/api/conversations/${encodeURIComponent(
      conversationId,
    )}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    },
  );
  if (!response.ok) {
    throw new Error(
      await readErrorDetail(response, "Failed to update conversation"),
    );
  }
  return response.json();
}
