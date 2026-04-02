"use client";

import {
  ChainOfThoughtPrimitive,
  MessagePrimitive,
  useAui,
  useAuiState,
  type ReasoningMessagePartComponent,
  type ToolCallMessagePartComponent,
} from "@assistant-ui/react";
import {
  CheckIcon,
  ChevronDownIcon,
  LightbulbIcon,
  LoaderCircleIcon,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  type ComponentProps,
  type PropsWithChildren,
} from "react";

import { ToolFallback } from "@/components/assistant-ui/tool-fallback";
import { ToolContent } from "@/components/tool-ui";
import {
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  buildAssistantProcessSummary,
  collectAssistantProcessSteps,
} from "@/lib/assistant-process";
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
  toolName: string;
};

type AssistantMessageContentPart =
  | { type: "text" }
  | AssistantReasoningPart
  | AssistantToolCallPart;

type MessagePartsComponents = NonNullable<
  ComponentProps<typeof MessagePrimitive.Parts>["components"]
>;

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

function parseToolArgs(
  args: Record<string, unknown> | undefined,
  argsText?: string,
): Record<string, unknown> | undefined {
  if (args && Object.keys(args).length > 0) {
    return args;
  }

  if (!argsText) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(argsText);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function AssistantProcessGroup({
  children,
  isStreaming,
  summary,
}: PropsWithChildren<{
  isStreaming: boolean;
  summary: string;
}>) {
  const aui = useAui();
  const collapsed = useAuiState((s) => s.chainOfThought.collapsed);
  const wasStreamingRef = useRef(isStreaming);

  useEffect(() => {
    if (isStreaming) {
      aui.chainOfThought().setCollapsed(false);
      wasStreamingRef.current = true;
      return;
    }

    if (wasStreamingRef.current) {
      aui.chainOfThought().setCollapsed(true);
      wasStreamingRef.current = false;
    }
  }, [aui, isStreaming]);

  return (
    <ChainOfThoughtPrimitive.Root className="mb-3 overflow-hidden rounded-xl border border-border/40 bg-card/25">
      <ChainOfThoughtPrimitive.AccordionTrigger className="group flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent/10">
        <div
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-full border",
            isStreaming
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border/60 bg-background/70 text-muted-foreground",
          )}
        >
          {isStreaming ? (
            <LoaderCircleIcon className="size-3.5 animate-spin" />
          ) : (
            <CheckIcon className="size-3.5" />
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
            collapsed ? "-rotate-90" : "rotate-0",
          )}
        />
      </ChainOfThoughtPrimitive.AccordionTrigger>

      {!collapsed ? (
        <div className="border-t border-border/50 px-3 py-3">
          <div className="space-y-2.5">{children}</div>
        </div>
      ) : null}
    </ChainOfThoughtPrimitive.Root>
  );
}

const AssistantReasoning: ReasoningMessagePartComponent = ({ text, status }) => {
  const running = status.type === "running";

  return (
    <div className="rounded-xl border border-border/40 bg-background/35 px-3 py-3">
      <div className="flex items-center gap-2">
        <div
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-full border",
            running
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border/60 bg-background text-muted-foreground",
          )}
        >
          {running ? (
            <LoaderCircleIcon className="size-3 animate-spin" />
          ) : (
            <LightbulbIcon className="size-3" />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">Thinking</p>
          <p className="truncate text-xs text-muted-foreground">
            {getReasoningSummary(text)}
          </p>
        </div>
      </div>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-foreground/85">
        {text}
      </p>
    </div>
  );
};

const AssistantProcessTool: ToolCallMessagePartComponent = ({
  toolName,
  args,
  argsText,
  result,
  status,
}) => {
  const running = status.type === "running";
  const parsedArgs = parseToolArgs(args, argsText);
  const content = stringifyToolResult(result);
  const summary = getToolSummary(toolName, parsedArgs, content);

  return (
    <ToolFallback.Root className="group/process-tool rounded-xl border border-border/40 bg-background/35 py-0">
      <CollapsibleTrigger className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent/10">
        <div
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-full border",
            running
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border/60 bg-background text-muted-foreground",
          )}
        >
          {running ? (
            <LoaderCircleIcon className="size-3 animate-spin" />
          ) : (
            <CheckIcon className="size-3" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              {getToolDisplayName(toolName)}
            </span>
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em]",
                running
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border/70 bg-background text-muted-foreground",
              )}
            >
              {running ? "Live" : "Done"}
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {summary}
          </p>
        </div>
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=closed]/process-tool:-rotate-90 group-data-[state=open]/process-tool:rotate-0" />
      </CollapsibleTrigger>
      <ToolFallback.Content className="border-t border-border/50 px-3 py-3">
        <div className="rounded-xl border border-border/50 bg-background/40 p-3">
          <ToolContent
            args={parsedArgs}
            content={content}
            toolName={toolName}
          />
        </div>
      </ToolFallback.Content>
    </ToolFallback.Root>
  );
};

export function AssistantSteps() {
  const content = useAuiState((s) => s.message.content);
  const isStreaming = useAuiState(
    (s) => s.thread.isRunning && s.message.isLast && s.message.role === "assistant",
  );

  const steps = useMemo(
    () =>
      collectAssistantProcessSteps(content as AssistantMessageContentPart[]),
    [content],
  );

  const summary = useMemo(
    () => buildAssistantProcessSummary(steps, isStreaming),
    [isStreaming, steps],
  );

  const components = useMemo(
    () =>
      ({
        Text: () => null,
        ChainOfThought: ({ children }: PropsWithChildren) => (
          <AssistantProcessGroup isStreaming={isStreaming} summary={summary}>
            {children}
          </AssistantProcessGroup>
        ),
        Reasoning: AssistantReasoning,
        tools: {
          Fallback: AssistantProcessTool,
        },
      }) as unknown as MessagePartsComponents,
    [isStreaming, summary],
  );

  if (steps.length === 0) {
    return null;
  }

  return <MessagePrimitive.Parts components={components} />;
}
