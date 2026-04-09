import type {
  BffConversationDetail,
  BffConversationList,
  CreateConversationResult,
} from "./types";

type FetchLike = typeof fetch;

type StreamMessageInput = {
  conversationId: string;
  message: string;
  signal?: AbortSignal;
};

export async function createConversation(fetchImpl: FetchLike = fetch) {
  const response = await fetchImpl("/api/bff/conversations", {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("Failed to create conversation");
  }

  return (await response.json()) as CreateConversationResult;
}

export async function listConversations(fetchImpl: FetchLike = fetch) {
  const response = await fetchImpl("/api/bff/conversations");

  if (!response.ok) {
    throw new Error("Failed to list conversations");
  }

  return (await response.json()) as BffConversationList;
}

export async function getConversation(
  conversationId: string,
  fetchImpl: FetchLike = fetch,
) {
  const response = await fetchImpl(`/api/bff/conversations/${conversationId}`);

  if (!response.ok) {
    throw new Error("Failed to load conversation");
  }

  return (await response.json()) as BffConversationDetail;
}

export async function streamMessage(
  input: StreamMessageInput,
  fetchImpl: FetchLike = fetch,
) {
  const response = await fetchImpl(
    `/api/bff/conversations/${input.conversationId}/messages/stream`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      signal: input.signal,
      body: JSON.stringify({
        message: input.message,
      }),
    },
  );

  if (!response.ok || !response.body) {
    throw new Error("Failed to stream message");
  }

  return response.body;
}
