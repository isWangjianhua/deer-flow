import { buildGatewayUrl } from "./config";
import { throwIfUnauthorized } from "./auth-errors";
import { withGatewayAuthHeaders } from "./auth";

export type ConversationSummary = {
  conversation_id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export type AssistantUiThreadSummary = {
  thread_id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const message = response.ok ? "" : await response.text();
  throwIfUnauthorized(response.status, message || undefined);

  if (!response.ok) {
    throw new Error(message || `Gateway request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function listConversations(): Promise<ConversationSummary[]> {
  const response = await fetch(buildGatewayUrl("/api/conversations"), {
    credentials: "include",
    cache: "no-store",
    headers: withGatewayAuthHeaders(),
  });

  return parseJsonResponse<ConversationSummary[]>(response);
}

export async function listAssistantUiThreads(): Promise<AssistantUiThreadSummary[]> {
  const response = await fetch(buildGatewayUrl("/api/assistant-ui/threads"), {
    credentials: "include",
    cache: "no-store",
    headers: withGatewayAuthHeaders(),
  });

  return parseJsonResponse<AssistantUiThreadSummary[]>(response);
}

export async function createConversation(title = ""): Promise<ConversationSummary> {
  const response = await fetch(buildGatewayUrl("/api/conversations"), {
    method: "POST",
    credentials: "include",
    headers: withGatewayAuthHeaders({
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({ title }),
  });

  return parseJsonResponse<ConversationSummary>(response);
}

export async function updateConversation(id: string, title: string): Promise<ConversationSummary> {
  const response = await fetch(buildGatewayUrl(`/api/conversations/${id}`), {
    method: "PATCH",
    credentials: "include",
    headers: withGatewayAuthHeaders({
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({ title }),
  });

  return parseJsonResponse<ConversationSummary>(response);
}

export async function deleteConversation(id: string): Promise<void> {
  const response = await fetch(buildGatewayUrl(`/api/conversations/${id}`), {
    method: "DELETE",
    credentials: "include",
    headers: withGatewayAuthHeaders(),
  });

  const message = response.ok || response.status === 204 ? "" : await response.text();
  throwIfUnauthorized(response.status, message || undefined);

  if (!response.ok && response.status !== 204) {
    throw new Error(message || `Gateway request failed with ${response.status}`);
  }
}
