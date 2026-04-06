import { buildGatewayUrl } from "../config";
import { throwIfUnauthorized } from "../auth-errors";
import { withGatewayAuthHeaders } from "../auth";

type BaseStreamEvent = {
  type: string;
};

export type ChatStreamEvent =
  | {
      type: "data-conversation";
      data: { conversationId?: string };
    }
  | {
      type: "data-tool-call";
      data: {
        messageId?: string;
        toolCallId?: string;
        name?: string;
        args?: Record<string, unknown>;
      };
    }
  | {
      type: "data-tool-result";
      data: {
        messageId?: string;
        toolCallId?: string;
        name?: string;
        content?: string;
      };
    }
  | {
      type: "data-reasoning";
      data: {
        messageId?: string;
        content?: string;
      };
    }
  | {
      type: "text-start";
      id: string;
    }
  | {
      type: "text-delta";
      id: string;
      delta: string;
    }
  | {
      type: "text-end";
      id: string;
    }
  | {
      type: "start";
      messageId: string;
    }
  | {
      type: "finish";
    }
  | {
      type: "error";
      errorText?: string;
    };

export type ChatRequestMessage = {
  role: string;
  content?: string;
  parts?: Array<Record<string, unknown>>;
};

function tryParseFramePayload(line: string): ChatStreamEvent | null {
  if (!line.startsWith("data: ")) {
    return null;
  }

  const payload = line.slice(6);
  if (payload === "[DONE]") {
    return null;
  }

  let parsed: BaseStreamEvent | null = null;
  try {
    parsed = JSON.parse(payload) as BaseStreamEvent;
  } catch {
    return null;
  }

  if (!parsed || typeof parsed.type !== "string") {
    return null;
  }

  return parsed as ChatStreamEvent;
}

export function parseStreamFrame(chunk: string): ChatStreamEvent | null {
  for (const line of chunk.split("\n")) {
    const event = tryParseFramePayload(line);
    if (event) {
      return event;
    }
  }

  return null;
}

export async function collectChatStreamEvents(chunks: Iterable<string>): Promise<ChatStreamEvent[]> {
  const events: ChatStreamEvent[] = [];

  for (const chunk of chunks) {
    for (const line of chunk.split("\n")) {
      const event = tryParseFramePayload(line);
      if (event) {
        events.push(event);
      }
    }
  }

  return events;
}

async function* readSseChunks(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    let separatorIndex = buffer.indexOf("\n\n");
    while (separatorIndex >= 0) {
      const chunk = buffer.slice(0, separatorIndex + 2);
      buffer = buffer.slice(separatorIndex + 2);
      yield chunk;
      separatorIndex = buffer.indexOf("\n\n");
    }
  }

  if (buffer.trim()) {
    yield buffer;
  }
}

export async function streamChat(request: {
  conversationId?: string;
  messages: ChatRequestMessage[];
  modelName?: string;
}): Promise<AsyncGenerator<ChatStreamEvent>> {
  const response = await fetch(buildGatewayUrl("/api/chat"), {
    method: "POST",
    credentials: "include",
    headers: withGatewayAuthHeaders({
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({
      id: request.conversationId ?? null,
      messages: request.messages,
      body: {
        conversation_id: request.conversationId,
        model_name: request.modelName,
      },
    }),
  });

  if (!response.ok || !response.body) {
    const message = await response.text();
    throwIfUnauthorized(response.status, message || undefined);
    throw new Error(message || `Gateway request failed with ${response.status}`);
  }

  const responseBody = response.body;

  return (async function* () {
    for await (const chunk of readSseChunks(responseBody)) {
      const event = parseStreamFrame(chunk);
      if (event) {
        yield event;
      }
    }
  })();
}
