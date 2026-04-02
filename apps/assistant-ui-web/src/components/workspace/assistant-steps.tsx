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
  TerminalIcon,
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
}: PropsWithChildren<{
  isStreaming: boolean;
  summary?: string;
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
    <ChainOfThoughtPrimitive.Root className="my-1">
      <ChainOfThoughtPrimitive.AccordionTrigger className="group flex w-fit items-center gap-2 py-1.5 text-left text-muted-foreground transition-colors hover:text-foreground">
        <div className="flex items-center justify-center">
          {isStreaming ? (
            <LoaderCircleIcon className="size-4 animate-spin text-primary" />
          ) : (
            <LightbulbIcon className="size-4" />
          )}
        </div>
        <span className="text-[14px] font-medium selection:bg-transparent">
          {isStreaming ? "思考中..." : "隐藏步骤"}
        </span>
        <ChevronDownIcon
          className={cn(
            "ml-1 size-4 shrink-0 transition-transform duration-200",
            collapsed ? "-rotate-90" : "rotate-0",
          )}
        />
      </ChainOfThoughtPrimitive.AccordionTrigger>

      {!collapsed ? (
        <div className="mb-4 mt-1 ms-2 border-l-2 border-border/50 py-1 pl-4">
          <div className="space-y-4">{children}</div>
        </div>
      ) : null}
    </ChainOfThoughtPrimitive.Root>
  );
}

const AssistantReasoning: any = (props: any) => {
  const text = props.text || props.part?.text || "";

  if (!text || text.trim().length === 0) {
    return (
      <span className="animate-pulse text-[14px] text-muted-foreground/60">
        正在准备思考链路...
      </span>
    );
  }

  return (
    <div className="whitespace-pre-wrap text-[14px] leading-relaxed text-muted-foreground/90">
      {text}
    </div>
  );
};

const AssistantProcessTool: any = (props: any) => {
  const toolName = props.toolName || props.part?.toolName;
  const args = props.args || props.part?.args;
  const argsText = props.argsText || props.part?.argsText;
  const result = props.result || props.part?.result;
  const status = props.status || props.part?.status || { type: "running" };

  const running = status.type === "running";
  const parsedArgs = parseToolArgs(args, argsText);
  const content = stringifyToolResult(result);

  return (
    <ToolFallback.Root className="group/process-tool overflow-hidden rounded-xl border border-border/60 bg-background shadow-sm">
      <CollapsibleTrigger className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/40">
        <div className="flex items-center justify-center text-muted-foreground">
          {running ? (
            <LoaderCircleIcon className="size-3.5 animate-spin text-primary" />
          ) : (
            <CheckIcon className="size-3.5" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <span className="font-medium text-foreground/80">
            {getToolDisplayName(toolName)}
          </span>
        </div>
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=closed]/process-tool:-rotate-90 group-data-[state=open]/process-tool:rotate-0" />
      </CollapsibleTrigger>
      <ToolFallback.Content className="border-t border-border/50 bg-muted/10 px-3 py-3">
        <ToolContent
          args={parsedArgs}
          content={content}
          toolName={toolName}
        />
      </ToolFallback.Content>
    </ToolFallback.Root>
  );
};

export function AssistantSteps() {
  const content = useAuiState((s) => s.message.content);
  const isStreaming = useAuiState(
    (s) => s.thread.isRunning && s.message.isLast && s.message.role === "assistant",
  );

  const validContent = useMemo(() => {
    return (content as AssistantMessageContentPart[]).filter((part) => {
      if (part.type === "reasoning") {
        return part.text.trim().length > 0 || isStreaming;
      }
      return true;
    });
  }, [content, isStreaming]);

  const steps = useMemo(
    () => collectAssistantProcessSteps(validContent),
    [validContent],
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
