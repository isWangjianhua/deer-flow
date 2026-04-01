type TextPart = {
  type: "text";
  text: string;
};

type ReasoningPart = {
  type: "reasoning";
  text: string;
};

type ToolCallPart = {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
};

type ToolResultPart = {
  type: "tool-result";
  toolCallId: string;
  toolName: string;
  content: string;
};

export type AssistantUiMessage = {
  id: string;
  role: "user" | "assistant";
  parts: Array<TextPart | ReasoningPart | ToolCallPart | ToolResultPart>;
};

type DeerFlowMessageContentPart =
  | {
      type: "text";
      text: string;
      thinking?: string;
    }
  | {
      type: "image_url";
      image_url: string | { url: string };
    };

type DeerFlowToolCall = {
  id?: string;
  name?: string;
  args?: Record<string, unknown>;
};

type DeerFlowMessage = {
  id?: string;
  type: "human" | "ai" | "tool";
  content: string | DeerFlowMessageContentPart[];
  name?: string | null;
  tool_call_id?: string | null;
  tool_calls?: DeerFlowToolCall[];
  additional_kwargs?: Record<string, unknown>;
};

function extractTextContent(message: DeerFlowMessage): string {
  if (typeof message.content === "string") {
    return message.content.trim();
  }

  return message.content
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("\n")
    .trim();
}

function extractReasoningContent(message: DeerFlowMessage): string | null {
  const explicitReasoning = message.additional_kwargs?.reasoning_content;
  if (typeof explicitReasoning === "string" && explicitReasoning.trim()) {
    return explicitReasoning.trim();
  }

  if (Array.isArray(message.content)) {
    for (const part of message.content) {
      if (part.type === "text" && typeof part.thinking === "string" && part.thinking.trim()) {
        return part.thinking.trim();
      }
    }
  }

  return null;
}

function isInternalControlMessage(message: DeerFlowMessage): boolean {
  return extractTextContent(message).startsWith("[LOOP DETECTED]");
}

function normalizeId(message: DeerFlowMessage, fallback: string): string {
  return typeof message.id === "string" && message.id.length > 0 ? message.id : fallback;
}

function extractAssistantParts(message: DeerFlowMessage, fallbackId: string): AssistantUiMessage["parts"] {
  if (message.type === "tool") {
    return [
      {
        type: "tool-result",
        toolCallId: message.tool_call_id ?? fallbackId,
        toolName: message.name ?? "tool",
        content: extractTextContent(message),
      },
    ];
  }

  const parts: AssistantUiMessage["parts"] = [];
  const reasoning = extractReasoningContent(message);
  if (reasoning) {
    parts.push({
      type: "reasoning",
      text: reasoning,
    });
  }

  for (const toolCall of message.tool_calls ?? []) {
    if (!toolCall.id || !toolCall.name) {
      continue;
    }
    parts.push({
      type: "tool-call",
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      args: toolCall.args ?? {},
    });
  }

  const text = extractTextContent(message);
  if (text.length > 0) {
    parts.push({
      type: "text",
      text,
    });
  }

  return parts;
}

export function convertDeerFlowMessages(messages: DeerFlowMessage[]): AssistantUiMessage[] {
  const converted: AssistantUiMessage[] = [];
  let currentAssistant: AssistantUiMessage | null = null;

  for (const [index, message] of messages.entries()) {
    if (isInternalControlMessage(message)) {
      continue;
    }

    const id = normalizeId(message, `message_${index}`);

    if (message.type === "human") {
      currentAssistant = null;
      converted.push({
        id,
        role: "user",
        parts: [{ type: "text", text: extractTextContent(message) }],
      });
      continue;
    }

    const parts = extractAssistantParts(message, id);
    if (parts.length === 0) {
      continue;
    }

    if (!currentAssistant) {
      currentAssistant = {
        id,
        role: "assistant",
        parts: [...parts],
      };
      converted.push(currentAssistant);
      continue;
    }

    currentAssistant.parts.push(...parts);
  }

  return converted;
}
