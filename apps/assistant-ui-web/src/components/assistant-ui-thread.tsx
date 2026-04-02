"use client";

import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type AppendMessage,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { useMemo, useState } from "react";

import { Thread } from "@/components/assistant-ui/thread";
import type { ChatStreamEvent } from "@/lib/runtime/chat-stream";
import {
  runConversationStream,
  type DeerFlowRuntimeState,
} from "@/lib/runtime/deerflow-runtime";
import type { AssistantUiMessage } from "@/lib/runtime/message-converter";
import {
  buildThreadPresentation,
  type ThreadEventCard,
  type ThreadRenderBlock,
} from "@/lib/runtime/thread-presentation";

function toToolCallPart(event: Extract<ThreadEventCard, { kind: "tool" }>) {
  return {
    type: "tool-call" as const,
    toolCallId: event.id,
    toolName: event.toolName,
    args: event.args as any,
    argsText: JSON.stringify(event.args ?? {}),
    result: event.content,
  };
}

function toThreadMessageLike(message: ThreadRenderBlock): ThreadMessageLike {
  const content: Array<Exclude<ThreadMessageLike["content"], string>[number]> = [];

  if (message.role === "assistant") {
    for (const event of message.events) {
      if (event.kind === "reasoning") {
        content.push({
          type: "reasoning",
          text: event.content,
        });
        continue;
      }

      content.push(toToolCallPart(event));
    }
  }

  if (message.body.length > 0) {
    content.push({
      type: "text",
      text: message.body,
    });
  }

  return {
    id: message.id,
    role: message.role,
    content,
  };
}

function extractUserText(message: AppendMessage): string {
  return message.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function createOptimisticState(
  optimisticUserMessage: AssistantUiMessage,
  liveEvents: ChatStreamEvent[] = [],
): DeerFlowRuntimeState {
  return {
    conversationId: null,
    title: "",
    messages: [optimisticUserMessage],
    artifacts: [],
    todos: [],
    liveEvents,
  };
}

type AssistantUiThreadProps = Readonly<{
  initialState: DeerFlowRuntimeState | null;
  ensureAuthenticated?: () => Promise<boolean>;
  modelName?: string;
  onStateChange?: (state: DeerFlowRuntimeState) => void;
}>;

export function AssistantUiThread({
  ensureAuthenticated,
  initialState,
  modelName,
  onStateChange,
}: AssistantUiThreadProps) {
  const [runtimeState, setRuntimeState] = useState<DeerFlowRuntimeState | null>(initialState);
  const [isRunning, setIsRunning] = useState(false);

  const presentation = useMemo(
    () =>
      buildThreadPresentation(
        runtimeState?.messages ?? [],
        runtimeState?.liveEvents ?? [],
        runtimeState?.artifacts ?? [],
      ),
    [runtimeState],
  );

  const runtimeMessages = useMemo(() => {
    const blocks = presentation.liveBlock
      ? [...presentation.blocks, presentation.liveBlock]
      : presentation.blocks;

    return blocks.map(toThreadMessageLike);
  }, [presentation]);

  const runtime = useExternalStoreRuntime(
    useMemo(
      () => ({
        isRunning,
        messages: runtimeMessages,
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
              return createOptimisticState(optimisticUserMessage);
            }

            return {
              ...current,
              messages: [...current.messages, optimisticUserMessage],
              liveEvents: [],
            };
          });

          try {
            const nextState = await runConversationStream({
              conversationId: runtimeState?.conversationId ?? undefined,
              messages: [{ role: "user", content: text, parts: [{ type: "text", text }] }],
              modelName,
              onEvent: (event) => {
                setRuntimeState((current) => {
                  if (!current) {
                    return createOptimisticState(optimisticUserMessage, [event]);
                  }

                  return {
                    ...current,
                    liveEvents: [...current.liveEvents, event],
                  };
                });
              },
            });

            setRuntimeState(nextState);
            onStateChange?.(nextState);
          } finally {
            setIsRunning(false);
          }
        },
      }),
      [ensureAuthenticated, isRunning, modelName, onStateChange, runtimeMessages, runtimeState?.conversationId],
    ),
  );

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <Thread />
    </AssistantRuntimeProvider>
  );
}
