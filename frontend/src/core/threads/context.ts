import type { LocalSettings } from "../settings/local";

import type { AgentThreadContext } from "./types";

export type SharedAgentRunContext = Pick<
  AgentThreadContext,
  | "model_name"
  | "thinking_enabled"
  | "is_plan_mode"
  | "subagent_enabled"
  | "reasoning_effort"
>;

export function buildAgentRunContext(
  context: LocalSettings["context"],
): SharedAgentRunContext {
  return {
    model_name: context.model_name ?? undefined,
    thinking_enabled: context.mode !== "flash",
    is_plan_mode: context.mode === "pro" || context.mode === "ultra",
    subagent_enabled: context.mode === "ultra",
    reasoning_effort:
      context.reasoning_effort ??
      (context.mode === "ultra"
        ? "high"
        : context.mode === "pro"
          ? "medium"
          : context.mode === "thinking"
            ? "low"
            : undefined),
  };
}
