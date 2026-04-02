"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  FilePenLineIcon,
  FolderOpenIcon,
  GlobeIcon,
  LightbulbIcon,
  LoaderCircleIcon,
  MessageCircleQuestionIcon,
  SearchIcon,
  SquareTerminalIcon,
  WrenchIcon,
} from "lucide-react";
import { useAuiState } from "@assistant-ui/react";

import { ToolContent } from "@/components/tool-ui";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  getReasoningSummary,
  getToolDisplayName,
  getToolSummary,
} from "@/lib/event-cards";
import { cn } from "@/lib/utils";

type AssistantReasoningPart = {
  type: "reasoning";
  text: string;
};

type AssistantToolCallPart = {
  type: "tool-call";
  toolCallId?: string;
  toolName: string;
  args?: Record<string, unknown>;
  result?: unknown;
};

type StepItem =
  | {
      id: string;
      kind: "reasoning";
      title: string;
      summary: string;
      body: string;
      running: boolean;
    }
  | {
      id: string;
      kind: "tool";
      title: string;
      summary: string;
      toolName: string;
      args?: Record<string, unknown>;
      content?: string;
      running: boolean;
    };

function stringifyToolResult(result: unknown): string | undefined {
  if (typeof result === "string") {
    return result;
  }

  if (result === undefined || result === null || result === "") {
    return undefined;
  }

  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return String(result);
  }
}

function getToolIcon(toolName: string) {
  switch (toolName) {
    case "web_search":
      return SearchIcon;
    case "web_fetch":
      return GlobeIcon;
    case "read_file":
      return FolderOpenIcon;
    case "write_file":
    case "str_replace":
      return FilePenLineIcon;
    case "bash":
    case "run_command":
      return SquareTerminalIcon;
    case "ask_clarification":
      return MessageCircleQuestionIcon;
    default:
      return WrenchIcon;
  }
}

function buildSteps(
  content: Array<
    | { type: "text"; text: string }
    | AssistantReasoningPart
    | AssistantToolCallPart
  >,
  isStreaming: boolean,
): StepItem[] {
  return content.reduce<StepItem[]>((steps, part, index) => {
    if (part.type === "reasoning") {
      steps.push({
        id: `reasoning-${index}`,
        kind: "reasoning",
        title: "Thinking",
        summary: getReasoningSummary(part.text),
        body: part.text,
        running: isStreaming && index === content.length - 1,
      });
      return steps;
    }

    if (part.type === "tool-call") {
      const contentText = stringifyToolResult(part.result);
      steps.push({
        id: part.toolCallId ?? `tool-${index}`,
        kind: "tool",
        title: getToolDisplayName(part.toolName ?? "tool"),
        summary: getToolSummary(part.toolName, part.args, contentText),
        toolName: part.toolName,
        args: part.args,
        content: contentText,
        running: isStreaming && !contentText,
      });
      return steps;
    }

    return steps;
  }, []);
}

function buildGroupSummary(steps: StepItem[], isStreaming: boolean) {
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

function StepRow({ step, isLast }: Readonly<{ step: StepItem; isLast: boolean }>) {
  const Icon = step.kind === "reasoning" ? LightbulbIcon : getToolIcon(step.toolName);

  return (
    <div className="grid grid-cols-[auto_1fr] gap-3">
      <div className="flex flex-col items-center">
        <div
          className={cn(
            "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border",
            step.running
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border/70 bg-background/70 text-muted-foreground",
          )}
        >
          {step.running ? (
            <LoaderCircleIcon className="size-3.5 animate-spin" />
          ) : (
            <Icon className="size-3.5" />
          )}
        </div>
        {!isLast ? <div className="mt-2 h-full w-px bg-border/60" /> : null}
      </div>

      <div className="pb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{step.title}</span>
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em]",
              step.running
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-border/70 bg-background text-muted-foreground",
            )}
          >
            {step.running ? "Live" : "Done"}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{step.summary}</p>
        {step.kind === "reasoning" ? (
          <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-foreground/80">
            {step.body}
          </p>
        ) : (
          <div className="mt-3 rounded-2xl border border-border/60 bg-background/40 px-3 py-3">
            <ToolContent
              args={step.args}
              content={step.content}
              toolName={step.toolName}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export function AssistantSteps() {
  const parts = useAuiState((s) =>
    s.message.content.filter(
      (part) => part.type === "reasoning" || part.type === "tool-call",
    ),
  );
  const isStreaming = useAuiState(
    (s) => s.thread.isRunning && s.message.isLast && s.message.role === "assistant",
  );
  const [open, setOpen] = useState(isStreaming);
  const wasStreamingRef = useRef(isStreaming);

  const steps = useMemo(
    () => buildSteps(parts as Array<{ type: "text"; text: string } | AssistantReasoningPart | AssistantToolCallPart>, isStreaming),
    [isStreaming, parts],
  );

  const summary = useMemo(() => buildGroupSummary(steps, isStreaming), [isStreaming, steps]);

  useEffect(() => {
    if (isStreaming) {
      setOpen(true);
      wasStreamingRef.current = true;
      return;
    }

    if (wasStreamingRef.current) {
      setOpen(false);
      wasStreamingRef.current = false;
    }
  }, [isStreaming]);

  if (steps.length === 0) {
    return null;
  }

  return (
    <Collapsible
      className="mb-4 overflow-hidden rounded-2xl border border-border/60 bg-card/45"
      onOpenChange={setOpen}
      open={open}
    >
      <CollapsibleTrigger className="group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/15">
        <div
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full border",
            isStreaming
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border/70 bg-background/70 text-muted-foreground",
          )}
        >
          {isStreaming ? (
            <LoaderCircleIcon className="size-4 animate-spin" />
          ) : (
            <CheckIcon className="size-4" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              {isStreaming ? "Working through the answer" : "Thought process"}
            </span>
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em]",
                isStreaming
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border/70 bg-background text-muted-foreground",
              )}
            >
              {isStreaming ? "Live" : "Done"}
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {summary}
          </p>
        </div>
        <ChevronDownIcon
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
            open ? "rotate-0" : "-rotate-90",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent
        className={cn(
          "overflow-hidden border-t border-border/60 px-4",
          "data-[state=closed]:animate-collapsible-up",
          "data-[state=open]:animate-collapsible-down",
        )}
      >
        <div className="py-4">
          {steps.map((step, index) => (
            <StepRow key={step.id} isLast={index === steps.length - 1} step={step} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
