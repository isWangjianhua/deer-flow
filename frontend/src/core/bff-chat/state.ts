import type { BffChatEvent, BffChatState } from "./types";

export function createInitialChatState(): BffChatState {
  return { messages: [] };
}

function appendPostToolReasoning(
  currentReasoning: string,
  incomingDelta: string,
  preToolReasoning: string,
) {
  const nextReasoning = currentReasoning + incomingDelta;
  const normalizedPreToolReasoning = preToolReasoning.trim();
  const normalizedNextReasoning = nextReasoning.trim();

  if (!normalizedPreToolReasoning) {
    return nextReasoning;
  }

  if (normalizedNextReasoning === normalizedPreToolReasoning) {
    return "";
  }

  if (
    normalizedNextReasoning.length > normalizedPreToolReasoning.length &&
    normalizedNextReasoning.endsWith(normalizedPreToolReasoning)
  ) {
    return normalizedNextReasoning
      .slice(0, normalizedNextReasoning.length - normalizedPreToolReasoning.length)
      .trimEnd();
  }

  return nextReasoning;
}

export function applyBffChatEvent(
  state: BffChatState,
  event: BffChatEvent,
): BffChatState {
  if (event.type === "message.started") {
    return {
      ...state,
      messages: state.messages.concat({
        id: event.data.message_id,
        role: "assistant",
        content: "",
        reasoning_before_tools: "",
        reasoning_after_tools: "",
        status: "streaming",
        tools: [],
      }),
    };
  }

  const lastMessage = state.messages[state.messages.length - 1];
  if (!lastMessage) {
    return state;
  }

  if (event.type === "message.delta") {
    return {
      ...state,
      messages: state.messages.map((message) =>
        message.id === event.data.message_id
          ? { ...message, content: message.content + event.data.delta }
          : message,
      ),
    };
  }

  if (event.type === "reasoning.delta") {
    return {
      ...state,
      messages: state.messages.map((message) =>
        message.id === event.data.message_id
          ? message.tools.length === 0
            ? {
                ...message,
                reasoning_before_tools:
                  message.reasoning_before_tools + event.data.delta,
              }
            : {
                ...message,
                reasoning_after_tools:
                  appendPostToolReasoning(
                    message.reasoning_after_tools,
                    event.data.delta,
                    message.reasoning_before_tools,
                  ),
              }
          : message,
      ),
    };
  }

  if (event.type === "message.completed") {
    return {
      ...state,
      messages: state.messages.map((message) =>
        message.id === event.data.message_id
          ? { ...message, status: "completed" }
          : message,
      ),
    };
  }

  if (event.type === "tool.started") {
    return {
      ...state,
      messages: state.messages.map((message) =>
        message.id === lastMessage.id
          ? {
              ...message,
              tools: message.tools.concat({
                id: event.data.tool_call_id,
                label: event.data.label,
                name: event.data.name,
                args: event.data.args,
                status: "running",
                summary: null,
              }),
            }
          : message,
      ),
    };
  }

  if (event.type === "tool.progress") {
    return {
      ...state,
      messages: state.messages.map((message) =>
        message.id === lastMessage.id
          ? {
              ...message,
              tools: message.tools.map((tool) =>
                tool.id === event.data.tool_call_id
                  ? { ...tool, summary: event.data.message }
                  : tool,
              ),
            }
          : message,
      ),
    };
  }

  if (event.type === "tool.completed") {
    return {
      ...state,
      messages: state.messages.map((message) =>
        message.id === lastMessage.id
          ? {
              ...message,
              tools: message.tools.map((tool) =>
                tool.id === event.data.tool_call_id
                  ? { ...tool, status: "completed" }
                  : tool,
              ),
            }
          : message,
      ),
    };
  }

  if (event.type === "tool.failed") {
    return {
      ...state,
      messages: state.messages.map((message) =>
        message.id === lastMessage.id
          ? {
              ...message,
              tools: message.tools.map((tool) =>
                tool.id === event.data.tool_call_id
                  ? {
                      ...tool,
                      status: "failed",
                      summary: event.data.message,
                    }
                  : tool,
              ),
            }
          : message,
      ),
    };
  }

  return state;
}
