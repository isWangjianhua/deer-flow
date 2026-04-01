import { buildGatewayUrl } from "@/lib/config";

export type ConversationSummary = {
  conversation_id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

async function parseJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Gateway request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function listConversations(): Promise<ConversationSummary[]> {
  const response = await fetch(buildGatewayUrl("/api/conversations"), {
    credentials: "include",
    cache: "no-store",
  });

  return parseJsonResponse<ConversationSummary[]>(response);
}

export async function createConversation(title = ""): Promise<ConversationSummary> {
  const response = await fetch(buildGatewayUrl("/api/conversations"), {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title }),
  });

  return parseJsonResponse<ConversationSummary>(response);
}

export async function updateConversation(id: string, title: string): Promise<ConversationSummary> {
  const response = await fetch(buildGatewayUrl(`/api/conversations/${id}`), {
    method: "PATCH",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title }),
  });

  return parseJsonResponse<ConversationSummary>(response);
}

export async function deleteConversation(id: string): Promise<void> {
  const response = await fetch(buildGatewayUrl(`/api/conversations/${id}`), {
    method: "DELETE",
    credentials: "include",
  });

  if (!response.ok && response.status !== 204) {
    const message = await response.text();
    throw new Error(message || `Gateway request failed with ${response.status}`);
  }
}
