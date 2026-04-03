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
  BookOpenTextIcon,
  CheckIcon,
  ChevronDownIcon,
  FolderOpenIcon,
  GlobeIcon,
  ImageIcon,
  LightbulbIcon,
  ListTodoIcon,
  LoaderCircleIcon,
  MessageCircleQuestionMarkIcon,
  NotebookPenIcon,
  SearchIcon,
  SquareTerminalIcon,
  TerminalIcon,
  WrenchIcon,
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

function getToolIcon(toolName: string) {
  switch (toolName) {
    case "web_search":
      return SearchIcon;
    case "image_search":
      return ImageIcon;
    case "web_fetch":
      return GlobeIcon;
    case "ls":
      return FolderOpenIcon;
    case "read_file":
      return BookOpenTextIcon;
    case "write_file":
    case "str_replace":
      return NotebookPenIcon;
    case "bash":
    case "run_command":
      return SquareTerminalIcon;
    case "ask_clarification":
      return MessageCircleQuestionMarkIcon;
    case "write_todos":
      return ListTodoIcon;
    default:
      return WrenchIcon;
  }
}

function extractTitleFromMarkdown(markdown: string) {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match ? match[1] : null;
}

function ProcessToolResult({ toolName, args, result, content }: { toolName: string; args: any; result: any; content: string | undefined }) {
  const Pill = ({ children, href }: { children: React.ReactNode, href?: string }) => (
    <span className="inline-flex items-center gap-1 rounded-md border border-border/80 bg-secondary/80 px-2.5 py-0.5 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary">
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className="block max-w-[400px] truncate underline-offset-4 hover:underline">
          {children}
        </a>
      ) : (
        <span className="block max-w-[400px] truncate">{children}</span>
      )}
    </span>
  );

  let parsedResult = result;
  if (typeof result === "string") {
    try {
      parsedResult = JSON.parse(result);
    } catch {
      // ignore
    }
  } else if (!parsedResult && typeof content === "string") {
    try {
      parsedResult = JSON.parse(content);
    } catch {
      // ignore
    }
  }

  const pills: React.ReactElement[] = [];

  if (toolName === "web_search") {
    const results = Array.isArray(parsedResult) ? parsedResult : Array.isArray(parsedResult?.results) ? parsedResult.results : [];
    results.forEach((item: any) => {
      if (item && typeof item === "object" && item.url && item.title) {
        pills.push(<Pill key={item.url} href={item.url}>{item.title}</Pill>);
      }
    });
  } else if (toolName === "web_fetch") {
    const url = typeof args?.url === "string" ? args.url : null;
    if (url) {
      let title = url;
      if (typeof content === "string") {
        const extracted = extractTitleFromMarkdown(content);
        if (extracted) title = extracted;
      }
      pills.push(<Pill key={url} href={url}>{title}</Pill>);
    }
  } else if (toolName === "ls" || toolName === "read_file" || toolName === "write_file" || toolName === "str_replace") {
    const path = typeof args?.path === "string" ? args.path : null;
    if (path) {
      pills.push(<Pill key={path}>{path}</Pill>);
    }
  } else if (toolName === "bash" || toolName === "run_command") {
    const command = typeof args?.command === "string" ? args.command : null;
    if (command) {
      pills.push(<Pill key={command}>{command}</Pill>);
    }
  }

  if (pills.length > 0) {
    return <div className="flex flex-wrap gap-2">{pills}</div>;
  }

  const fallbackText = content || JSON.stringify(args || {}, null, 2);
  return (
    <div className="line-clamp-3 text-xs text-muted-foreground whitespace-pre-wrap font-mono bg-muted/30 p-2 rounded-md">
      {fallbackText.slice(0, 300)}{fallbackText.length > 300 ? "..." : ""}
    </div>
  );
}

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

function getToolLabel(toolName: string, args: any) {
  if (toolName === "web_search") {
    return args?.query ? `在网络上搜索 "${args.query}"` : "在网络上搜索";
  } else if (toolName === "web_fetch") {
    return "查看网页";
  } else if (toolName === "read_file") {
    return args?.path ? `读取文件 "${args.path}"` : "读取文件";
  } else if (toolName === "write_file") {
    return args?.path ? `编辑文件 "${args.path}"` : "编辑文件";
  } else if (toolName === "bash" || toolName === "run_command") {
    return "执行终端命令";
  } else if (toolName === "ls") {
    return args?.path ? `列出目录 "${args.path}"` : "列出目录";
  } else if (toolName === "ask_clarification") {
    return "向用户确认";
  }
  return getToolDisplayName(toolName);
}

const AssistantProcessTool: any = (props: any) => {
  const toolName = props.toolName || props.part?.toolName;
  const args = props.args || props.part?.args;
  const argsText = props.argsText || props.part?.argsText;
  const result = props.result || props.part?.result;
  const status = props.status || props.part?.status || { type: "running" };

  const running = status.type === "running";
  const parsedArgs = parseToolArgs(args, argsText);
  const content = stringifyToolResult(result);
  const ToolIcon = getToolIcon(toolName);
  const toolLabel = getToolLabel(toolName, parsedArgs);

  return (
    <div className="group/process-tool my-3 flex flex-col gap-2 relative">
      <div className="flex items-center gap-2 text-muted-foreground/80 hover:text-muted-foreground transition-colors">
        <div className="flex items-center justify-center">
          {running ? (
            <LoaderCircleIcon className="size-4 animate-spin text-primary" />
          ) : (
            <ToolIcon className="size-4" />
          )}
        </div>
        <span className="text-[14px] font-medium selection:bg-transparent">
          {toolLabel}
        </span>
      </div>
      {(parsedArgs || result || content) && (
        <div className="pl-6">
          <ProcessToolResult
            toolName={toolName}
            args={parsedArgs}
            result={result}
            content={content}
          />
        </div>
      )}
    </div>
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
        ChainOfThought: () => (
          <AssistantProcessGroup isStreaming={isStreaming} summary={summary}>
            <ChainOfThoughtPrimitive.Parts
              components={{
                Reasoning: AssistantReasoning,
                tools: {
                  Fallback: AssistantProcessTool,
                },
              }}
            />
          </AssistantProcessGroup>
        ),
      }) as unknown as MessagePartsComponents,
    [isStreaming, summary],
  );

  if (steps.length === 0) {
    return null;
  }

  return <MessagePrimitive.Parts components={components} />;
}
