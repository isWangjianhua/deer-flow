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
  return trimHistoricalReasoningDelta(nextReasoning, preToolReasoning);
}

function trimHistoricalReasoningDelta(
  incomingDelta: string,
  historicalReasoning: string,
) {
  const normalizedHistoricalReasoning = historicalReasoning.trim();
  let normalizedIncomingDelta = incomingDelta.trim();

  if (!normalizedHistoricalReasoning) {
    return incomingDelta;
  }

  if (normalizedIncomingDelta === normalizedHistoricalReasoning) {
    return "";
  }

  while (
    normalizedIncomingDelta.length > normalizedHistoricalReasoning.length &&
    normalizedIncomingDelta.startsWith(normalizedHistoricalReasoning)
  ) {
    normalizedIncomingDelta = normalizedIncomingDelta
      .slice(normalizedHistoricalReasoning.length)
      .trimStart();
  }

  while (
    normalizedIncomingDelta.length > normalizedHistoricalReasoning.length &&
    normalizedIncomingDelta.endsWith(normalizedHistoricalReasoning)
  ) {
    normalizedIncomingDelta = normalizedIncomingDelta
      .slice(0, normalizedIncomingDelta.length - normalizedHistoricalReasoning.length)
      .trimEnd();
  }

  if (normalizedIncomingDelta === normalizedHistoricalReasoning) {
    return "";
  }

  return normalizedIncomingDelta;
}

function collectHistoricalReasoning(
  steps: BffChatState["messages"][number]["steps"],
) {
  return steps
    .filter((step) => step.type === "reasoning")
    .map((step) => step.content)
    .join("");
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
        steps: [],
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
        message.id !== event.data.message_id
          ? message
          : (() => {
              const lastStep = message.steps[message.steps.length - 1];
              const nextDelta =
                lastStep?.type === "reasoning"
                  ? event.data.delta
                  : trimHistoricalReasoningDelta(
                      event.data.delta,
                      collectHistoricalReasoning(message.steps),
                    );

              const nextSteps =
                !nextDelta && lastStep?.type !== "reasoning"
                  ? message.steps
                  : lastStep?.type === "reasoning"
                    ? message.steps.map((step, index) =>
                        index === message.steps.length - 1
                          ? { ...step, content: step.content + nextDelta }
                          : step,
                      )
                    : message.steps.concat({
                        type: "reasoning",
                        content: nextDelta,
                      });

              return message.tools.length === 0
                ? {
                    ...message,
                    reasoning_before_tools:
                      message.reasoning_before_tools + event.data.delta,
                    steps: nextSteps,
                  }
                : {
                    ...message,
                    reasoning_after_tools:
                      appendPostToolReasoning(
                        message.reasoning_after_tools,
                        event.data.delta,
                        message.reasoning_before_tools,
                      ),
                    steps: nextSteps,
                  };
            })(),
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
              steps: message.steps.concat({
                type: "tool",
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
              steps: message.steps.map((step) =>
                step.type === "tool" && step.id === event.data.tool_call_id
                  ? { ...step, summary: event.data.message }
                  : step,
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
              steps: message.steps.map((step) =>
                step.type === "tool" && step.id === event.data.tool_call_id
                  ? { ...step, status: "completed" }
                  : step,
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
              steps: message.steps.map((step) =>
                step.type === "tool" && step.id === event.data.tool_call_id
                  ? {
                      ...step,
                      status: "failed",
                      summary: event.data.message,
                    }
                  : step,
              ),
            }
          : message,
      ),
    };
  }

  return state;
}
