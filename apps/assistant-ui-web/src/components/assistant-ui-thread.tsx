"use client";

import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  ThreadPrimitive,
  useExternalStoreRuntime,
  type MessageState,
} from "@assistant-ui/react";
import type { AppendMessage } from "@assistant-ui/react";
import { useMemo, useState } from "react";

import {
  loadRuntimeState,
  runConversationStream,
  type DeerFlowRuntimeState,
} from "../lib/runtime/deerflow-runtime";
import type {
  AssistantUiMessage,
} from "../lib/runtime/message-converter";
import type { ChatStreamEvent } from "../lib/runtime/chat-stream";
import type { ThreadMessageLike } from "@assistant-ui/react";
import { cn } from "@/lib/utils";
import { ChevronDownIcon, LoaderCircleIcon } from "lucide-react";

import { ToolCard } from "./tool-ui";

function mergeMessageParts(
  parts: AssistantUiMessage["parts"],
): ThreadMessageLike["content"] {
  const merged: Array<Exclude<ThreadMessageLike["content"], string>[number]> = [];
  const toolCalls = new Map<
    string,
    {
      type: "tool-call";
      toolCallId?: string;
      toolName: string;
      args?: Record<string, unknown>;
      argsText?: string;
      result?: unknown;
    }
  >();

  for (const part of parts) {
    if (part.type === "text") {
      merged.push({
        type: "text",
        text: part.text,
      });
      continue;
    }

    if (part.type === "reasoning") {
      merged.push({
        type: "reasoning",
        text: part.text,
      });
      continue;
    }

    if (part.type === "tool-call") {
      const toolCall = {
        type: "tool-call" as const,
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        args: (part.args ?? {}) as any,
        argsText: JSON.stringify(part.args ?? {}),
      };
      toolCalls.set(part.toolCallId, toolCall);
      merged.push(toolCall);
      continue;
    }

    const existing = toolCalls.get(part.toolCallId);
    if (existing) {
      existing.result = part.content;
      continue;
    }

    const synthetic = {
      type: "tool-call" as const,
      toolCallId: part.toolCallId,
      toolName: part.toolName,
      args: {},
      argsText: "{}",
      result: part.content,
    };
    toolCalls.set(part.toolCallId, synthetic);
    merged.push(synthetic);
  }

  return merged;
}

function toThreadMessageLike(message: AssistantUiMessage): ThreadMessageLike {
  return {
    id: message.id,
    role: message.role,
    content: mergeMessageParts(message.parts),
  };
}

function upsertLiveAssistant(
  current: AssistantUiMessage | null,
  event: ChatStreamEvent,
): AssistantUiMessage | null {
  if (event.type === "text-start") {
    return {
      id: `live-${event.id}`,
      role: "assistant",
      parts: [],
    };
  }

  if (!current) {
    return current;
  }

  if (event.type === "text-delta") {
    const nextParts = [...current.parts];
    const lastPart = nextParts[nextParts.length - 1];
    if (lastPart?.type === "text") {
      nextParts[nextParts.length - 1] = {
        ...lastPart,
        text: `${lastPart.text}${event.delta}`,
      };
    } else {
      nextParts.push({
        type: "text",
        text: event.delta,
      });
    }
    return { ...current, parts: nextParts };
  }

  if (event.type === "data-tool-call") {
    return {
      ...current,
      parts: [
        ...current.parts,
        {
          type: "tool-call",
          toolCallId: event.data.toolCallId ?? crypto.randomUUID(),
          toolName: event.data.name ?? "tool",
          args: event.data.args ?? {},
        },
      ],
    };
  }

  if (event.type === "data-tool-result") {
    return {
      ...current,
      parts: [
        ...current.parts,
        {
          type: "tool-result",
          toolCallId: event.data.toolCallId ?? crypto.randomUUID(),
          toolName: event.data.name ?? "tool",
          content: event.data.content ?? "",
        },
      ],
    };
  }

  if (event.type === "error") {
    return {
      ...current,
      parts: [
        ...current.parts,
        {
          type: "text",
          text: event.errorText ?? "Stream error",
        },
      ],
    };
  }

  return current;
}

function extractUserText(message: AppendMessage): string {
  return message.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function MessageRenderer({ message }: { message: MessageState }) {
  const reasoningParts = message.content.filter((part) => part.type === "reasoning");
  const textParts = message.content.filter((part) => part.type === "text");
  const toolParts = message.content.filter((part) => part.type === "tool-call");
  const isUser = message.role === "user";

  return (
    <article
      className={cn(
        "mx-auto w-full max-w-3xl px-4 py-5 md:px-6",
        isUser ? "flex justify-end" : "flex justify-start",
      )}
    >
      <div
        className={cn(
          "w-full",
          isUser ? "max-w-xl" : "max-w-3xl",
        )}
      >
        <header className={cn("mb-3 text-xs font-semibold uppercase tracking-[0.22em]", isUser ? "text-right text-white/40" : "text-white/35")}>
          {isUser ? "You" : "Assistant"}
        </header>

        {reasoningParts.length > 0 || toolParts.length > 0 ? (
          <details className="group mb-4 overflow-hidden rounded-3xl border border-white/10 bg-white/4 backdrop-blur-sm">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-sm text-white/75 marker:hidden">
              <span className="font-medium">Hidden steps</span>
              <ChevronDownIcon className="size-4 transition-transform group-open:rotate-180" />
            </summary>

            <div className="space-y-4 border-t border-white/8 px-5 py-4">
              {reasoningParts.map((part, index) => (
                <div
                  className="rounded-2xl border border-white/8 bg-black/15 px-4 py-3"
                  key={`reasoning-${message.id}-${index}`}
                >
                  <strong className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
                    思考
                  </strong>
                  <p className="mt-2 text-sm leading-7 text-white/72">{part.text}</p>
                </div>
              ))}

              {toolParts.map((part, index) => (
                <ToolCard
                  key={`tool-${part.toolCallId ?? index}`}
                  args={part.args as Record<string, unknown>}
                  content={
                    typeof part.result === "string"
                      ? part.result
                      : JSON.stringify(part.result ?? "", null, 2)
                  }
                  toolName={part.toolName}
                />
              ))}
            </div>
          </details>
        ) : null}

        {textParts.map((part, index) => (
          <div
            className={cn(
              "rounded-[28px] px-5 py-4 text-sm leading-8 shadow-lg shadow-black/10",
              isUser
                ? "bg-white/10 text-white"
                : "border border-white/8 bg-white/5 text-white/88 backdrop-blur-sm",
            )}
            key={`text-${message.id}-${index}`}
          >
            <p className="whitespace-pre-wrap">{part.text}</p>
          </div>
        ))}
      </div>
    </article>
  );
}

type AssistantUiThreadProps = Readonly<{
  initialState: DeerFlowRuntimeState | null;
  ensureAuthenticated?: () => Promise<boolean>;
  onStateChange?: (state: DeerFlowRuntimeState) => void;
}>;

export function AssistantUiThread({
  ensureAuthenticated,
  initialState,
  onStateChange,
}: AssistantUiThreadProps) {
  const [runtimeState, setRuntimeState] = useState<DeerFlowRuntimeState | null>(initialState);
  const [isRunning, setIsRunning] = useState(false);

  const runtime = useExternalStoreRuntime(
    useMemo(
      () => ({
        isRunning,
        messages: (runtimeState?.messages ?? []).map(toThreadMessageLike),
        convertMessage: (message: ThreadMessageLike) => message,
        onNew: async (message: AppendMessage) => {
          const text = extractUserText(message);
          if (!text) {
            return;
          }

          if (ensureAuthenticated) {
            const authenticated = await ensureAuthenticated();
            if (!authenticated) {
              return;
            }
          }

          setIsRunning(true);
          const optimisticUserMessage: AssistantUiMessage = {
            id: `user-${crypto.randomUUID()}`,
            role: "user",
            parts: [{ type: "text", text }],
          };

          setRuntimeState((current) => {
            if (!current) {
              return {
                conversationId: null,
                title: "",
                messages: [optimisticUserMessage],
                artifacts: [],
                todos: [],
                liveEvents: [],
              };
            }
            return {
              ...current,
              messages: [...current.messages, optimisticUserMessage],
            };
          });

          let liveAssistant: AssistantUiMessage | null = null;

          const nextState = await runConversationStream({
            conversationId: runtimeState?.conversationId ?? undefined,
            messages: [{ role: "user", content: text, parts: [{ type: "text", text }] }],
            onEvent: (event) => {
              liveAssistant = upsertLiveAssistant(liveAssistant, event);
              if (!liveAssistant) {
                return;
              }
              setRuntimeState((current) => {
                if (!current) {
                  return current;
                }
                const assistantMessages = current.messages.filter(
                  (item) => item.id !== liveAssistant?.id,
                );
                return {
                  ...current,
                  messages: [...assistantMessages, liveAssistant as AssistantUiMessage],
                };
              });
            },
          });

          setRuntimeState(nextState);
          onStateChange?.(nextState);
          setIsRunning(false);
        },
      }),
      [isRunning, onStateChange, runtimeState],
    ),
  );

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root className="flex min-h-[calc(100vh-145px)] flex-col">
        <ThreadPrimitive.Viewport className="relative flex-1 overflow-y-auto">
          <ThreadPrimitive.Messages>
            {({ message }) => <MessageRenderer message={message} />}
          </ThreadPrimitive.Messages>

          {isRunning ? (
            <div className="pointer-events-none sticky bottom-36 mx-auto mt-auto flex w-full max-w-3xl items-center gap-2 px-6 pb-4 text-sm text-white/45">
              <LoaderCircleIcon className="size-4 animate-spin" />
              Generating…
            </div>
          ) : null}
        </ThreadPrimitive.Viewport>
      </ThreadPrimitive.Root>

      <ComposerPrimitive.Root className="sticky bottom-0 border-t border-white/8 bg-[linear-gradient(180deg,rgba(23,26,34,0)_0%,rgba(23,26,34,0.94)_18%,rgba(23,26,34,1)_100%)] px-4 pb-6 pt-5 md:px-6">
        <div className="mx-auto flex max-w-3xl items-end gap-3 rounded-[28px] border border-white/10 bg-black/20 p-3 shadow-2xl shadow-black/20 backdrop-blur-xl">
          <ComposerPrimitive.Input
            className="min-h-14 flex-1 resize-none bg-transparent px-3 py-2 text-[15px] leading-7 text-white outline-none placeholder:text-white/30"
            placeholder="Ask something..."
          />
          <ComposerPrimitive.Send className="flex h-11 min-w-24 items-center justify-center rounded-2xl bg-white px-4 font-medium text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-white/35">
            Send
          </ComposerPrimitive.Send>
        </div>
      </ComposerPrimitive.Root>
    </AssistantRuntimeProvider>
  );
}
