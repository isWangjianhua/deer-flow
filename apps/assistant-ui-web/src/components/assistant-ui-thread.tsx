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
import { ChevronDownIcon, LoaderCircleIcon, PlusIcon } from "lucide-react";
import { Button } from "./ui/button";

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
        "mx-auto w-full max-w-4xl px-4 py-4 md:px-6",
        isUser ? "flex justify-end" : "flex justify-start",
      )}
    >
      <div
        className={cn(
          "w-full",
          isUser ? "max-w-xl" : "max-w-3xl",
        )}
      >
        {reasoningParts.length > 0 || toolParts.length > 0 ? (
          <details className="group mb-4 overflow-hidden rounded-2xl border border-border bg-card/60">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm text-muted-foreground marker:hidden">
              <span className="font-medium">Hidden steps</span>
              <ChevronDownIcon className="size-4 transition-transform group-open:rotate-180" />
            </summary>

            <div className="space-y-3 border-t border-border px-4 py-4">
              {reasoningParts.map((part, index) => (
                <div
                  className="rounded-xl border border-border bg-muted/30 px-4 py-3"
                  key={`reasoning-${message.id}-${index}`}
                >
                  <strong className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    思考
                  </strong>
                  <p className="mt-2 text-sm leading-7 text-foreground/80">{part.text}</p>
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
              "rounded-2xl px-4 py-3 text-[15px] leading-7",
              isUser
                ? "bg-muted text-foreground"
                : "text-foreground",
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
      <ThreadPrimitive.Root className="flex min-h-[calc(100vh-56px)] flex-col bg-background">
        <ThreadPrimitive.Viewport className="relative flex flex-1 flex-col overflow-y-auto px-4 pt-4 md:px-6">
          {(runtimeState?.messages.length ?? 0) === 0 ? (
            <div className="mx-auto my-auto flex w-full max-w-3xl flex-col px-4 pb-10 pt-16">
              <div className="mb-8">
                <h2 className="text-5xl font-semibold tracking-tight text-foreground">Hello there!</h2>
                <p className="mt-2 text-3xl text-muted-foreground">How can I help you today?</p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {[
                  ["What's the weather", "in Shanghai tomorrow?"],
                  ["Explain React hooks", "like useState and useEffect"],
                ].map(([title, subtitle]) => (
                  <button
                    className="rounded-3xl border border-border bg-background px-5 py-4 text-left transition-colors hover:bg-muted"
                    key={title}
                    onClick={() => {}}
                    type="button"
                  >
                    <div className="font-medium text-foreground">{title}</div>
                    <div className="text-muted-foreground">{subtitle}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <ThreadPrimitive.Messages>
            {({ message }) => <MessageRenderer message={message} />}
          </ThreadPrimitive.Messages>

          {isRunning ? (
            <div className="pointer-events-none sticky bottom-34 mx-auto mt-auto flex w-full max-w-3xl items-center gap-2 px-4 pb-4 text-sm text-muted-foreground md:px-0">
              <LoaderCircleIcon className="size-4 animate-spin" />
              Generating…
            </div>
          ) : null}
        </ThreadPrimitive.Viewport>
      </ThreadPrimitive.Root>

      <ComposerPrimitive.Root className="sticky bottom-0 border-t border-border bg-background px-4 pb-4 pt-4 md:px-6 md:pb-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-2 rounded-[28px] border border-border bg-background p-3">
          <div className="flex items-center justify-between px-1">
            <Button className="size-8 rounded-full" size="icon" type="button" variant="ghost">
              <PlusIcon className="size-4" />
            </Button>
          </div>

          <div className="flex items-end gap-3">
          <ComposerPrimitive.Input
            className="min-h-12 flex-1 resize-none bg-transparent px-3 py-2 text-[15px] leading-7 text-foreground outline-none placeholder:text-muted-foreground"
            placeholder="Send a message..."
          />
          <ComposerPrimitive.Send className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground">
            <ChevronDownIcon className="-rotate-90 size-4" />
          </ComposerPrimitive.Send>
        </div>
        </div>
      </ComposerPrimitive.Root>
    </AssistantRuntimeProvider>
  );
}
