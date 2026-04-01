import { buildGatewayUrl } from "./config";

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

  if (!response.ok) {
    const message = await response.text();
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
