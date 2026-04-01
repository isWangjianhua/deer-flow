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

  return (
    <article>
      <header>
        <strong>{message.role === "user" ? "You" : "Assistant"}</strong>
      </header>

      {reasoningParts.length > 0 || toolParts.length > 0 ? (
        <details>
          <summary>Hidden steps</summary>

          {reasoningParts.map((part, index) => (
            <div key={`reasoning-${message.id}-${index}`}>
              <strong>思考</strong>
              <p>{part.text}</p>
            </div>
          ))}

          {toolParts.map((part, index) => (
            <ToolCard
              key={`tool-${part.toolCallId ?? index}`}
              args={part.args as Record<string, unknown>}
              content={typeof part.result === "string" ? part.result : JSON.stringify(part.result ?? "", null, 2)}
              toolName={part.toolName}
            />
          ))}
        </details>
      ) : null}

      {textParts.map((part, index) => (
        <p key={`text-${message.id}-${index}`}>{part.text}</p>
      ))}
    </article>
  );
}

type AssistantUiThreadProps = Readonly<{
  initialState: DeerFlowRuntimeState | null;
  onStateChange?: (state: DeerFlowRuntimeState) => void;
}>;

export function AssistantUiThread({
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
      <ThreadPrimitive.Root>
        <ThreadPrimitive.Viewport>
          <ThreadPrimitive.Messages>
            {({ message }) => <MessageRenderer message={message} />}
          </ThreadPrimitive.Messages>
        </ThreadPrimitive.Viewport>
      </ThreadPrimitive.Root>

      <ComposerPrimitive.Root>
        <ComposerPrimitive.Input placeholder="Ask something..." />
        <ComposerPrimitive.Send>Send</ComposerPrimitive.Send>
      </ComposerPrimitive.Root>
    </AssistantRuntimeProvider>
  );
}
