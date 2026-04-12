import type { BffChatEvent, BffChatState } from "./types";

export function createInitialChatState(): BffChatState {
  return { messages: [] };
}

function stripLeadingHistoricalReasoningSteps(
  incomingDelta: string,
  historicalReasoningSteps: string[],
) {
  if (!incomingDelta) {
    return incomingDelta;
  }

  let nextDelta = incomingDelta;
  let changed = true;

  while (changed) {
    changed = false;

    for (const historicalStep of historicalReasoningSteps) {
      if (!historicalStep) {
        continue;
      }

      if (nextDelta === historicalStep) {
        return "";
      }

      if (
        nextDelta.length > historicalStep.length &&
        nextDelta.startsWith(historicalStep)
      ) {
        nextDelta = nextDelta.slice(historicalStep.length);
        changed = true;
        break;
      }
    }
  }

  return nextDelta;
}

function stripRepeatedRawPrefix(incomingDelta: string, prefix: string) {
  if (!prefix) {
    return incomingDelta;
  }

  if (
    incomingDelta.length > prefix.length &&
    incomingDelta.startsWith(prefix)
  ) {
    return incomingDelta.slice(prefix.length);
  }
  return incomingDelta;
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

function trimRepeatedCurrentReasoningPrefix(
  incomingDelta: string,
  currentReasoning: string,
) {
  const normalizedCurrentReasoning = currentReasoning.trim();
  let normalizedIncomingDelta = incomingDelta.trim();

  if (!normalizedCurrentReasoning || !normalizedIncomingDelta) {
    return normalizedIncomingDelta;
  }

  while (normalizedIncomingDelta.startsWith(normalizedCurrentReasoning)) {
    const remainder = normalizedIncomingDelta
      .slice(normalizedCurrentReasoning.length)
      .trimStart();
    if (!remainder.startsWith(normalizedCurrentReasoning)) {
      break;
    }
    normalizedIncomingDelta = remainder;
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

function collectHistoricalReasoningSteps(
  steps: BffChatState["messages"][number]["steps"],
) {
  return steps
    .filter((step) => step.type === "reasoning")
    .map((step) => step.content);
}

function collectReasoningBeforeFirstTool(
  steps: BffChatState["messages"][number]["steps"],
) {
  const firstToolIndex = steps.findIndex((step) => step.type === "tool");
  const boundary = firstToolIndex === -1 ? steps.length : firstToolIndex;
  return steps
    .slice(0, boundary)
    .filter((step) => step.type === "reasoning")
    .map((step) => step.content)
    .join("");
}

function collectReasoningAfterLastTool(
  steps: BffChatState["messages"][number]["steps"],
) {
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    if (steps[index]?.type === "tool") {
      return steps
        .slice(index + 1)
        .filter((step) => step.type === "reasoning")
        .map((step) => step.content)
        .join("");
    }
  }

  return "";
}

function mergeReasoningSnapshot(
  currentReasoning: string,
  incomingDelta: string,
  historicalReasoning: string,
) {
  const dedupedIncomingDelta = trimHistoricalReasoningDelta(
    incomingDelta,
    historicalReasoning,
  );
  const snapshotCandidate = trimRepeatedCurrentReasoningPrefix(
    dedupedIncomingDelta,
    currentReasoning,
  );
  const normalizedCurrentReasoning = currentReasoning.trim();
  const normalizedSnapshotCandidate = snapshotCandidate.trim();

  if (!currentReasoning) {
    return dedupedIncomingDelta;
  }

  if (!normalizedSnapshotCandidate) {
    return currentReasoning;
  }

  if (normalizedSnapshotCandidate === normalizedCurrentReasoning) {
    return currentReasoning;
  }

  if (normalizedSnapshotCandidate.startsWith(normalizedCurrentReasoning)) {
    return snapshotCandidate;
  }

  if (normalizedCurrentReasoning.startsWith(normalizedSnapshotCandidate)) {
    return currentReasoning;
  }

  return currentReasoning + incomingDelta;
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
              const historicalReasoningSteps =
                lastStep?.type === "reasoning"
                  ? collectHistoricalReasoningSteps(message.steps.slice(0, -1))
                  : collectHistoricalReasoningSteps(message.steps);
              const knownReasoningSteps =
                lastStep?.type === "reasoning"
                  ? historicalReasoningSteps.concat(lastStep.content)
                  : historicalReasoningSteps;
              const dedupedIncomingDelta = stripRepeatedRawPrefix(
                stripLeadingHistoricalReasoningSteps(
                  event.data.delta,
                  knownReasoningSteps,
                ),
                collectHistoricalReasoning(message.steps),
              );
              const historicalReasoning =
                lastStep?.type === "reasoning"
                  ? collectHistoricalReasoning(message.steps.slice(0, -1))
                  : collectHistoricalReasoning(message.steps);
              const nextReasoning =
                lastStep?.type === "reasoning"
                  ? mergeReasoningSnapshot(
                      lastStep.content,
                      dedupedIncomingDelta,
                      historicalReasoning,
                    )
                  : mergeReasoningSnapshot(
                      "",
                      dedupedIncomingDelta,
                      historicalReasoning,
                    );

              const nextSteps =
                !nextReasoning && lastStep?.type !== "reasoning"
                  ? message.steps
                  : lastStep?.type === "reasoning"
                    ? message.steps.map((step, index) =>
                        index === message.steps.length - 1
                          ? { ...step, content: nextReasoning }
                          : step,
                      )
                    : message.steps.concat({
                        type: "reasoning",
                        content: nextReasoning,
                      });

              return {
                ...message,
                reasoning_before_tools: collectReasoningBeforeFirstTool(nextSteps),
                reasoning_after_tools: collectReasoningAfterLastTool(nextSteps),
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
        message.id !== lastMessage.id
          ? message
          : (() => {
              const nextToolState = {
                id: event.data.tool_call_id,
                label: event.data.label,
                name: event.data.name,
                args: event.data.args,
                status: "running" as const,
                summary: null,
              };
              const existingTool = message.tools.find(
                (tool) => tool.id === event.data.tool_call_id,
              );
              const nextTools = existingTool
                ? message.tools.map((tool) =>
                    tool.id === event.data.tool_call_id
                      ? {
                          ...tool,
                          label: event.data.label,
                          name: event.data.name,
                          args: event.data.args,
                        }
                      : tool,
                  )
                : message.tools.concat(nextToolState);
              const nextSteps = existingTool
                ? message.steps.map((step) =>
                    step.type === "tool" && step.id === event.data.tool_call_id
                      ? {
                          ...step,
                          label: event.data.label,
                          name: event.data.name,
                          args: event.data.args,
                        }
                      : step,
                  )
                : message.steps.concat({
                    type: "tool" as const,
                    ...nextToolState,
                  });

              return {
                ...message,
                tools: nextTools,
                steps: nextSteps,
              };
            })(),
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
