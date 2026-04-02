import type { ChatStreamEvent } from "./chat-stream";
import type { AssistantUiMessage } from "./message-converter";

export type ThreadEventCard =
  | {
      id: string;
      source: {
        messageId: string;
        partIndex: number;
      };
      kind: "reasoning";
      title: string;
      content: string;
      status: "done" | "streaming";
    }
  | {
      id: string;
      source: {
        messageId: string;
        partIndex: number;
        toolCallId: string;
      };
      kind: "tool";
      title: string;
      toolName: string;
      args: Record<string, unknown>;
      content?: string;
      status: "pending" | "done";
    };

export type ThreadRenderBlock = {
  id: string;
  source: {
    messageId: string;
  };
  role: "user" | "assistant";
  body: string;
  events: ThreadEventCard[];
};

export type ThreadPresentation = {
  blocks: ThreadRenderBlock[];
  liveBlock: ThreadRenderBlock | null;
  canvas: {
    items: string[];
  };
};

function collectBody(parts: AssistantUiMessage["parts"]): string {
  return parts
    .filter((part): part is Extract<AssistantUiMessage["parts"][number], { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .filter((text) => text.length > 0)
    .join("\n");
}

function collectMessageEvents(messageId: string, parts: AssistantUiMessage["parts"]): ThreadEventCard[] {
  const events: ThreadEventCard[] = [];
  const toolCards = new Map<string, Extract<ThreadEventCard, { kind: "tool" }>>();

  parts.forEach((part, index) => {
    if (part.type === "reasoning") {
      events.push({
        id: `${messageId}:reasoning:${index}`,
        source: {
          messageId,
          partIndex: index,
        },
        kind: "reasoning",
        title: "Reasoning",
        content: part.text,
        status: "done",
      });
      return;
    }

    if (part.type === "tool-call") {
      const card: Extract<ThreadEventCard, { kind: "tool" }> = {
        id: part.toolCallId,
        source: {
          messageId,
          partIndex: index,
          toolCallId: part.toolCallId,
        },
        kind: "tool",
        title: part.toolName,
        toolName: part.toolName,
        args: part.args,
        status: "pending",
      };
      toolCards.set(part.toolCallId, card);
      events.push(card);
      return;
    }

    if (part.type === "tool-result") {
      const existing = toolCards.get(part.toolCallId);
      if (existing) {
        existing.content = part.content;
        existing.status = "done";
        return;
      }

      const card: Extract<ThreadEventCard, { kind: "tool" }> = {
        id: part.toolCallId,
        source: {
          messageId,
          partIndex: index,
          toolCallId: part.toolCallId,
        },
        kind: "tool",
        title: part.toolName,
        toolName: part.toolName,
        args: {},
        content: part.content,
        status: "done",
      };
      toolCards.set(part.toolCallId, card);
      events.push(card);
    }
  });

  return events;
}

function buildLiveBlock(events: ChatStreamEvent[]): ThreadRenderBlock | null {
  const bodyParts: string[] = [];
  const reasoningCards = new Map<string, Extract<ThreadEventCard, { kind: "reasoning" }>>();
  const cards = new Map<string, Extract<ThreadEventCard, { kind: "tool" }>>();
  let id = "live";
  let sourceMessageId = "live";

  for (const event of events) {
    if (event.type === "text-start") {
      id = event.id;
      sourceMessageId = event.id;
      continue;
    }

    if (event.type === "text-delta") {
      id = event.id;
      sourceMessageId = event.id;
      bodyParts.push(event.delta);
      continue;
    }

    if (event.type === "text-end") {
      id = event.id;
      sourceMessageId = event.id;
      continue;
    }

    if (event.type === "data-reasoning") {
      const messageId = event.data.messageId ?? sourceMessageId;
      const content = event.data.content?.trim();
      if (!content) {
        continue;
      }

      reasoningCards.set(messageId, {
        id: `${messageId}:reasoning:live`,
        source: {
          messageId,
          partIndex: -1,
        },
        kind: "reasoning",
        title: "Reasoning",
        content,
        status: "streaming",
      });
      continue;
    }

    if (event.type === "data-tool-call") {
      if (!event.data.toolCallId || !event.data.name) {
        continue;
      }

      const card: Extract<ThreadEventCard, { kind: "tool" }> = {
        id: event.data.toolCallId,
        source: {
          messageId: event.data.messageId ?? sourceMessageId,
          partIndex: -1,
          toolCallId: event.data.toolCallId,
        },
        kind: "tool",
        title: event.data.name,
        toolName: event.data.name,
        args: event.data.args ?? {},
        status: "pending",
      };
      cards.set(event.data.toolCallId, card);
      continue;
    }

    if (event.type === "data-tool-result") {
      if (!event.data.toolCallId || !event.data.name) {
        continue;
      }

      const existing = cards.get(event.data.toolCallId);
      if (existing) {
        existing.content = event.data.content;
        existing.status = "done";
        continue;
      }

      cards.set(event.data.toolCallId, {
        id: event.data.toolCallId,
        source: {
          messageId: event.data.messageId ?? sourceMessageId,
          partIndex: -1,
          toolCallId: event.data.toolCallId,
        },
        kind: "tool",
        title: event.data.name,
        toolName: event.data.name,
        args: {},
        content: event.data.content,
        status: "done",
      });
    }
  }

  if (bodyParts.length === 0 && reasoningCards.size === 0 && cards.size === 0) {
    return null;
  }

  return {
    id,
    source: {
      messageId: sourceMessageId,
    },
    role: "assistant",
    body: bodyParts.join(""),
    events: [...reasoningCards.values(), ...cards.values()],
  };
}

export function buildThreadPresentation(
  messages: AssistantUiMessage[],
  liveEvents: ChatStreamEvent[],
  artifacts: string[] = [],
): ThreadPresentation {
  return {
    blocks: messages.map((message) => ({
      id: message.id,
      source: {
        messageId: message.id,
      },
      role: message.role,
      body: collectBody(message.parts),
      events: collectMessageEvents(message.id, message.parts),
    })),
    liveBlock: buildLiveBlock(liveEvents),
    canvas: {
      items: artifacts,
    },
  };
}
