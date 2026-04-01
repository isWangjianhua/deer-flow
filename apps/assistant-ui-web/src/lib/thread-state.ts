import { buildGatewayUrl } from "./config";
import { throwIfUnauthorized } from "./auth-errors";

export type DeerFlowThreadState = {
  title: string;
  messages: unknown[];
  artifacts: string[];
  todos: unknown[];
};

type ThreadStateResponse = {
  values?: Partial<DeerFlowThreadState>;
};

export async function getThreadState(conversationId: string): Promise<DeerFlowThreadState> {
  const response = await fetch(buildGatewayUrl(`/api/threads/${conversationId}/state`), {
    credentials: "include",
    cache: "no-store",
  });

  const message = response.ok ? "" : await response.text();
  throwIfUnauthorized(response.status, message || undefined);

  if (!response.ok) {
    throw new Error(message || `Gateway request failed with ${response.status}`);
  }

  const payload = (await response.json()) as ThreadStateResponse;
  return {
    title: payload.values?.title ?? "",
    messages: payload.values?.messages ?? [],
    artifacts: payload.values?.artifacts ?? [],
    todos: payload.values?.todos ?? [],
  };
}
