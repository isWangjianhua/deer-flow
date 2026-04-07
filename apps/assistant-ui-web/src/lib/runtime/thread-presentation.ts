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

function createToolCardId(baseToolCallId: string, occurrence: number): string {
  if (occurrence === 1) {
    return baseToolCallId;
  }
  return `${baseToolCallId}__${occurrence}`;
}

function collectMessageEvents(messageId: string, parts: AssistantUiMessage["parts"]): ThreadEventCard[] {
  const events: ThreadEventCard[] = [];
  const toolOccurrences = new Map<string, number>();
  const pendingToolCards = new Map<string, Array<Extract<ThreadEventCard, { kind: "tool" }>>>();

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
      const occurrence = (toolOccurrences.get(part.toolCallId) ?? 0) + 1;
      toolOccurrences.set(part.toolCallId, occurrence);
      const card: Extract<ThreadEventCard, { kind: "tool" }> = {
        id: createToolCardId(part.toolCallId, occurrence),
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
      const pending = pendingToolCards.get(part.toolCallId) ?? [];
      pending.push(card);
      pendingToolCards.set(part.toolCallId, pending);
      events.push(card);
      return;
    }

    if (part.type === "tool-result") {
      const pending = pendingToolCards.get(part.toolCallId) ?? [];
      const existing = pending.shift();
      if (existing) {
        existing.content = part.content;
        existing.status = "done";
        return;
      }

      const occurrence = (toolOccurrences.get(part.toolCallId) ?? 0) + 1;
      toolOccurrences.set(part.toolCallId, occurrence);
      const card: Extract<ThreadEventCard, { kind: "tool" }> = {
        id: createToolCardId(part.toolCallId, occurrence),
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
      events.push(card);
    }
  });

  return events;
}

function buildLiveBlock(events: ChatStreamEvent[]): ThreadRenderBlock | null {
  const bodyParts: string[] = [];
  const orderedEvents: ThreadEventCard[] = [];
  const reasoningCards = new Map<string, Extract<ThreadEventCard, { kind: "reasoning" }>>();
  const toolOccurrences = new Map<string, number>();
  const pendingToolCards = new Map<string, Array<Extract<ThreadEventCard, { kind: "tool" }>>>();
  const lastDoneToolResultContent = new Map<string, string>();
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

      const existing = reasoningCards.get(messageId);
      if (existing) {
        existing.content = content;
        continue;
      }

      const card: Extract<ThreadEventCard, { kind: "reasoning" }> = {
        id: `${messageId}:reasoning:live`,
        source: {
          messageId,
          partIndex: -1,
        },
        kind: "reasoning",
        title: "Reasoning",
        content,
        status: "streaming",
      };
      reasoningCards.set(messageId, card);
      orderedEvents.push(card);
      continue;
    }

    if (event.type === "data-tool-call") {
      if (!event.data.toolCallId || !event.data.name) {
        continue;
      }

      const pending = pendingToolCards.get(event.data.toolCallId) ?? [];
      const existingPending = pending[pending.length - 1];
      if (existingPending) {
        existingPending.title = event.data.name;
        existingPending.toolName = event.data.name;
        const incomingArgs = event.data.args ?? {};
        if (Object.keys(incomingArgs).length > 0 || Object.keys(existingPending.args).length === 0) {
          existingPending.args = incomingArgs;
        }
        if (event.data.messageId) {
          existingPending.source.messageId = event.data.messageId;
        }
        continue;
      }

      const occurrence = (toolOccurrences.get(event.data.toolCallId) ?? 0) + 1;
      toolOccurrences.set(event.data.toolCallId, occurrence);
      const card: Extract<ThreadEventCard, { kind: "tool" }> = {
        id: createToolCardId(event.data.toolCallId, occurrence),
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
      orderedEvents.push(card);
      pending.push(card);
      pendingToolCards.set(event.data.toolCallId, pending);
      continue;
    }

    if (event.type === "data-tool-result") {
      if (!event.data.toolCallId || !event.data.name) {
        continue;
      }

      const incomingContent = event.data.content ?? "";
      const lastDoneContent = lastDoneToolResultContent.get(event.data.toolCallId);
      const pending = pendingToolCards.get(event.data.toolCallId) ?? [];
      const existing = pending[0];
      if (existing) {
        if (lastDoneContent !== undefined && lastDoneContent === incomingContent) {
          // Ignore stale replayed result from a previous completed call cycle.
          continue;
        }
        pending.shift();
        existing.content = incomingContent;
        existing.status = "done";
        lastDoneToolResultContent.set(event.data.toolCallId, incomingContent);
        continue;
      }

      if (lastDoneContent !== undefined && lastDoneContent === incomingContent) {
        // Duplicate replay when there is no pending call card.
        continue;
      }

      const occurrence = (toolOccurrences.get(event.data.toolCallId) ?? 0) + 1;
      toolOccurrences.set(event.data.toolCallId, occurrence);
      orderedEvents.push({
        id: createToolCardId(event.data.toolCallId, occurrence),
        source: {
          messageId: event.data.messageId ?? sourceMessageId,
          partIndex: -1,
          toolCallId: event.data.toolCallId,
        },
        kind: "tool",
        title: event.data.name,
        toolName: event.data.name,
        args: {},
        content: incomingContent,
        status: "done",
      });
      lastDoneToolResultContent.set(event.data.toolCallId, incomingContent);
    }
  }

  if (bodyParts.length === 0 && orderedEvents.length === 0) {
    return null;
  }

  return {
    id,
    source: {
      messageId: sourceMessageId,
    },
    role: "assistant",
    body: bodyParts.join(""),
    events: orderedEvents,
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
