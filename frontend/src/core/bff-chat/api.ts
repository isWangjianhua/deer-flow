import {
  getLocalBffHeaderName,
  isLocalDevAuthMode,
  readLocalBffAccessToken,
} from "@/core/auth/local";
import type { AgentThreadContext } from "@/core/threads";

import type {
  BffConversationDetail,
  BffConversationList,
  CreateConversationResult,
  DeleteConversationResult,
} from "./types";

type FetchLike = typeof fetch;

type StreamMessageInput = {
  conversationId: string;
  message: string;
  context?: Pick<
    AgentThreadContext,
    | "model_name"
    | "thinking_enabled"
    | "is_plan_mode"
    | "subagent_enabled"
    | "reasoning_effort"
  >;
  signal?: AbortSignal;
};

type GenerateSuggestionsInput = {
  conversationId: string;
  messages: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  modelName?: string;
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

export async function renameConversation(
  conversationId: string,
  title: string,
  fetchImpl: FetchLike = fetch,
) {
  const response = await fetchImpl(`/api/bff/conversations/${conversationId}`, {
    method: "PATCH",
    headers: buildRequestHeaders("application/json"),
    body: JSON.stringify({ title }),
  });

  if (!response.ok) {
    throw new Error("Failed to rename conversation");
  }

  return (await response.json()) as CreateConversationResult;
}

export async function deleteConversation(
  conversationId: string,
  fetchImpl: FetchLike = fetch,
) {
  const response = await fetchImpl(`/api/bff/conversations/${conversationId}`, {
    method: "DELETE",
    headers: buildRequestHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to delete conversation");
  }

  return (await response.json()) as DeleteConversationResult;
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
        context: input.context,
      }),
    },
  );

  if (!response.ok || !response.body) {
    throw new Error("Failed to stream message");
  }

  return response.body;
}

export async function generateSuggestions(
  input: GenerateSuggestionsInput,
  fetchImpl: FetchLike = fetch,
) {
  const response = await fetchImpl(
    `/api/bff/conversations/${input.conversationId}/suggestions`,
    {
      method: "POST",
      headers: buildRequestHeaders("application/json"),
      body: JSON.stringify({
        messages: input.messages,
        n: 3,
        model_name: input.modelName,
      }),
    },
  );

  if (!response.ok) {
    throw new Error("Failed to generate suggestions");
  }

  const payload = (await response.json()) as { suggestions?: string[] };
  return (payload.suggestions ?? [])
    .map((suggestion) => suggestion.trim())
    .filter((suggestion) => suggestion.length > 0)
    .slice(0, 5);
}
