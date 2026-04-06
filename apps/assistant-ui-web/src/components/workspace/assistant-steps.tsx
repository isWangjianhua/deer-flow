"use client";

import {
  useAuiState,
} from "@assistant-ui/react";
import {
  BookOpenTextIcon,
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
  WrenchIcon,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  type PropsWithChildren,
  useRef,
  useState,
} from "react";

import {
  collectAssistantProcessEntries,
  buildAssistantProcessSummary,
  collectAssistantProcessSteps,
} from "@/lib/assistant-process";
import { summarizeToolResult } from "@/lib/assistant-step-summaries";
import {
  getToolDisplayName,
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
};

type AssistantMessageContentPart =
  | { type: "text" }
  | AssistantReasoningPart
  | AssistantToolCallPart;

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

function ProcessToolResult({
  toolName,
  args,
  result,
  content,
  isRunning,
}: {
  toolName: string;
  args: any;
  result: any;
  content: string | undefined;
  isRunning: boolean;
}) {
  const Pill = ({ children, href }: { children: React.ReactNode; href?: string }) => (
    <span className="inline-flex items-center gap-1 rounded-md border border-border/80 bg-secondary/80 px-2.5 py-0.5 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary">
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="block max-w-[400px] truncate underline-offset-4 hover:underline"
        >
          {children}
        </a>
      ) : (
        <span className="block max-w-[400px] truncate">{children}</span>
      )}
    </span>
  );

  const summary = summarizeToolResult(toolName, args, result, content, isRunning);

  if (summary.mode === "hidden") {
    return null;
  }

  if (summary.mode === "pills") {
    return (
      <div className="flex flex-wrap gap-2">
        {summary.items.map((item, index) => (
          <Pill key={`${item.label}-${index}`} href={item.href}>{item.label}</Pill>
        ))}
      </div>
    );
  }

  const textItems = summary.text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (textItems.length > 0) {
    return (
      <div className="flex flex-wrap gap-2">
        {textItems.map((item, index) => (
          <Pill key={`${item}-${index}`}>{item}</Pill>
        ))}
      </div>
    );
  }

  return (
    <div className="text-[13px] leading-relaxed text-muted-foreground/90">
      {summary.text}
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
}>) {
  const [collapsed, setCollapsed] = useState(!isStreaming);
  const wasStreamingRef = useRef(isStreaming);

  useEffect(() => {
    if (isStreaming) {
      setCollapsed(false);
      wasStreamingRef.current = true;
      return;
    }

    if (wasStreamingRef.current) {
      setCollapsed(true);
      wasStreamingRef.current = false;
    }
  }, [isStreaming]);

  return (
    <div className="my-1">
      <button
        type="button"
        onClick={() => setCollapsed((prev) => !prev)}
        className="group flex w-fit items-center gap-2 py-1.5 text-left text-muted-foreground transition-colors hover:text-foreground"
      >
        <div className="flex items-center justify-center">
          {isStreaming ? (
            <LoaderCircleIcon className="size-4 animate-spin text-primary" />
          ) : (
            <LightbulbIcon className="size-4" />
          )}
        </div>
        <span className="text-[14px] font-medium">
          {isStreaming ? "思考中..." : "隐藏步骤"}
        </span>
        <ChevronDownIcon
          className={cn(
            "ml-1 size-4 shrink-0 transition-transform duration-200",
            collapsed ? "-rotate-90" : "rotate-0",
          )}
        />
      </button>

      {!collapsed ? (
        <div className="mb-4 mt-1 ms-2 border-l-2 border-border/50 py-1 pl-4">
          <div className="space-y-4">{children}</div>
        </div>
      ) : null}
    </div>
  );
}

const AssistantReasoning = (props: any) => {
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

const AssistantProcessTool = (props: any) => {
  const toolName = props.toolName ?? props.part?.toolName;
  const args = props.args ?? props.part?.args;
  const argsText = props.argsText ?? props.part?.argsText;
  const result = props.result ?? props.part?.result;
  const status = props.status ?? props.part?.status;
  const isStreaming = Boolean(props.isStreaming);

  const statusType = typeof status === "string" ? status : status?.type;
  const hasResult = result !== undefined && result !== null && result !== "";
  const running =
    statusType === "running" ||
    statusType === "pending" ||
    statusType === "in_progress" ||
    (isStreaming && !hasResult);
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
        <span className="text-[14px] font-medium">
          {toolLabel}
        </span>
      </div>
      {(parsedArgs || result || content || running) && (
        <div className="pl-6">
          <ProcessToolResult
            toolName={toolName}
            args={parsedArgs}
            result={result}
            content={content}
            isRunning={running}
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
        return part.text?.trim().length > 0 || isStreaming;
      }
      return true;
    });
  }, [content, isStreaming]);

  const entries = useMemo(
    () => collectAssistantProcessEntries(validContent, isStreaming),
    [validContent, isStreaming],
  );

  const steps = useMemo(
    () => collectAssistantProcessSteps(validContent, isStreaming),
    [validContent, isStreaming],
  );

  const summary = useMemo(
    () => buildAssistantProcessSummary(steps, isStreaming),
    [isStreaming, steps],
  );

  if (entries.length === 0 || steps.length === 0) {
    return null;
  }

  return (
    <AssistantProcessGroup isStreaming={isStreaming}>
      {entries.map((entry, index) => {
        if (entry.kind === "reasoning") {
          return <AssistantReasoning key={`reasoning-${index}`} text={entry.text} />;
        }

        return (
          <AssistantProcessTool
            key={`tool-${entry.toolCallId ?? index}`}
            toolName={entry.toolName}
            args={entry.args}
            argsText={entry.argsText}
            result={entry.result}
            status={entry.status}
            isStreaming={isStreaming}
          />
        );
      })}
    </AssistantProcessGroup>
  );
}
