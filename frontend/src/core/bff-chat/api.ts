import {
  getLocalBffHeaderName,
  isLocalDevAuthMode,
  readLocalBffAccessToken,
} from "@/core/auth/local";

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

function buildRequestHeaders(contentType?: string) {
  const headers = new Headers();
  if (contentType) {
    headers.set("content-type", contentType);
  }

  if (isLocalDevAuthMode()) {
    const token = readLocalBffAccessToken();
    if (token) {
      headers.set(getLocalBffHeaderName(), token);
    }
  }

  return headers;
}

export async function createConversation(fetchImpl: FetchLike = fetch) {
  const response = await fetchImpl("/api/bff/conversations", {
    method: "POST",
    headers: buildRequestHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to create conversation");
  }

  return (await response.json()) as CreateConversationResult;
}

export async function listConversations(fetchImpl: FetchLike = fetch) {
  const response = await fetchImpl("/api/bff/conversations", {
    headers: buildRequestHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to list conversations");
  }

  return (await response.json()) as BffConversationList;
}

export async function getConversation(
  conversationId: string,
  fetchImpl: FetchLike = fetch,
) {
  const response = await fetchImpl(`/api/bff/conversations/${conversationId}`, {
    headers: buildRequestHeaders(),
  });

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
      headers: buildRequestHeaders("application/json"),
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
