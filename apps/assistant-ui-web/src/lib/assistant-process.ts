import { getToolDisplayName } from "./event-cards";

export type AssistantProcessStep = {
  kind: "reasoning" | "tool";
  title: string;
};

type AssistantProcessContentPart =
  | { type: "text" }
  | { type: "reasoning" }
  | { type: "tool-call"; toolName: string };

export function collectAssistantProcessSteps(
  content: AssistantProcessContentPart[],
): AssistantProcessStep[] {
  return content.reduce<AssistantProcessStep[]>((steps, part) => {
    if (part.type === "reasoning") {
      steps.push({
        kind: "reasoning",
        title: "Thinking",
      });
      return steps;
    }

    if (part.type === "tool-call") {
      steps.push({
        kind: "tool",
        title: getToolDisplayName(part.toolName),
      });
    }

    return steps;
  }, []);
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
