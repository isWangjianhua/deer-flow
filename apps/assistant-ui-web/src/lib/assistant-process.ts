import { getToolDisplayName } from "./event-cards";

export type AssistantProcessStep = {
  kind: "reasoning" | "tool";
  title: string;
};

export type AssistantProcessEntry =
  | {
      kind: "reasoning";
      text: string;
    }
  | {
      kind: "tool";
      toolCallId?: string;
      toolName: string;
      args?: Record<string, unknown>;
      argsText?: string;
      result?: unknown;
      status?: { type?: string; [key: string]: unknown };
    };

type AssistantProcessContentPart =
  | { type: "text" }
  | { type: "reasoning"; text?: string }
  | {
      type: "tool-call";
      toolCallId?: string;
      toolName: string;
      args?: Record<string, unknown>;
      argsText?: string;
      result?: unknown;
      status?: { type?: string; [key: string]: unknown };
    };

export function collectAssistantProcessEntries(
  content: AssistantProcessContentPart[],
  isStreaming: boolean,
): AssistantProcessEntry[] {
  return content.flatMap<AssistantProcessEntry>((part) => {
    if (part.type === "reasoning") {
      const text = part.text?.trim() ?? "";
      if (!text && !isStreaming) {
        return [];
      }

      return [
        {
          kind: "reasoning",
          text,
        },
      ];
    }

    if (part.type === "tool-call") {
      return [
        {
          kind: "tool",
          ...(part.toolCallId ? { toolCallId: part.toolCallId } : {}),
          toolName: part.toolName,
          args: part.args,
          argsText: part.argsText,
          result: part.result,
          status: part.status,
        },
      ];
    }

    return [];
  });
}

export function collectAssistantProcessSteps(
  content: AssistantProcessContentPart[],
  isStreaming = false,
): AssistantProcessStep[] {
  return collectAssistantProcessEntries(content, isStreaming).reduce<AssistantProcessStep[]>(
    (steps, part) => {
      if (part.kind === "reasoning") {
        steps.push({
          kind: "reasoning",
          title: "Thinking",
        });
        return steps;
      }

      steps.push({
        kind: "tool",
        title: getToolDisplayName(part.toolName),
      });
      return steps;
    },
    [],
  );
}

export function buildAssistantProcessSummary(
  steps: AssistantProcessStep[],
  isStreaming: boolean,
): string {
  if (steps.length === 0) {
    return "";
  }

  const latest = steps[steps.length - 1];
  if (isStreaming) {
    if (latest?.kind === "tool") {
      return `Using ${latest.title} · ${steps.length} step${steps.length === 1 ? "" : "s"}`;
    }

    return `Thinking · ${steps.length} step${steps.length === 1 ? "" : "s"}`;
  }

  const toolTitles = [...new Set(steps.filter((step) => step.kind === "tool").map((step) => step.title))];
  if (toolTitles.length === 0) {
    return `${steps.length} thought step${steps.length === 1 ? "" : "s"}`;
  }

  const preview = toolTitles.slice(0, 2).join(", ");
  const suffix = toolTitles.length > 2 ? ` +${toolTitles.length - 2}` : "";
  return `${preview}${suffix} · ${steps.length} step${steps.length === 1 ? "" : "s"}`;
}
