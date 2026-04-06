import { buildGatewayUrl } from "./config";
import { throwIfUnauthorized } from "./auth-errors";
import { withGatewayAuthHeaders } from "./auth";

export type AssistantUiThreadState = {
  thread_id: string;
  title: string;
  messages: unknown[];
  artifacts: string[];
  todos: unknown[];
};

export async function getThreadState(conversationId: string): Promise<AssistantUiThreadState> {
  const response = await fetch(buildGatewayUrl(`/api/assistant-ui/threads/${conversationId}`), {
    credentials: "include",
    cache: "no-store",
    headers: withGatewayAuthHeaders(),
  });

  const message = response.ok ? "" : await response.text();
  throwIfUnauthorized(response.status, message || undefined);

  if (!response.ok) {
    throw new Error(message || `Gateway request failed with ${response.status}`);
  }

  return (await response.json()) as AssistantUiThreadState;
}
