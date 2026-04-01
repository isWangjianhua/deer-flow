"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useState } from "react";

import { createConversation } from "../lib/conversations";
import {
  loadRuntimeState,
  runConversationStream,
  type DeerFlowRuntimeState,
} from "../lib/runtime/deerflow-runtime";
import type { AssistantUiMessage } from "../lib/runtime/message-converter";
import {
  createThreadListRuntime,
  type ThreadListItem,
} from "../lib/runtime/thread-list-runtime";
import type { ChatStreamEvent } from "../lib/runtime/chat-stream";

import { AppShell } from "./app-shell";
import { ChatThread } from "./chat-thread";

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

type ThreadScreenProps = Readonly<{
  initialConversationId?: string | null;
}>;

export function ThreadScreen({ initialConversationId = null }: ThreadScreenProps) {
  const router = useRouter();
  const threadListRuntime = useMemo(() => createThreadListRuntime(), []);
  const [threads, setThreads] = useState<ThreadListItem[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(
    initialConversationId,
  );
  const [runtimeState, setRuntimeState] = useState<DeerFlowRuntimeState | null>(null);
  const [liveAssistant, setLiveAssistant] = useState<AssistantUiMessage | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const loadedThreads = await threadListRuntime.load();
        if (cancelled) {
          return;
        }
        setThreads(loadedThreads);

        if (!initialConversationId) {
          setLoading(false);
          return;
        }

        const state = await loadRuntimeState(initialConversationId);
        if (cancelled) {
          return;
        }
        setRuntimeState(state);
      } catch (bootstrapError) {
        if (!cancelled) {
          setError(
            bootstrapError instanceof Error
              ? bootstrapError.message
              : "Failed to load thread screen.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [initialConversationId, threadListRuntime]);

  const displayMessages = useMemo(() => {
    const canonicalMessages = runtimeState?.messages ?? [];
    return liveAssistant ? [...canonicalMessages, liveAssistant] : canonicalMessages;
  }, [liveAssistant, runtimeState?.messages]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || submitting) {
      return;
    }

    setSubmitting(true);
    setError(null);
    setDraft("");

    const optimisticUserMessage: AssistantUiMessage = {
      id: `user-${crypto.randomUUID()}`,
      role: "user",
      parts: [{ type: "text", text }],
    };

    setRuntimeState((current) => {
      if (!current) {
        return {
          conversationId,
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

    try {
      const nextState = await runConversationStream({
        conversationId: conversationId ?? undefined,
        messages: [
          {
            role: "user",
            content: text,
            parts: [{ type: "text", text }],
          },
        ],
        onEvent: (streamEvent) => {
          setLiveAssistant((current) => upsertLiveAssistant(current, streamEvent));
        },
      });

      setLiveAssistant(null);
      setRuntimeState(nextState);

      if (nextState.conversationId && nextState.conversationId !== conversationId) {
        setConversationId(nextState.conversationId);
        router.replace(`/workspace/${nextState.conversationId}`);
      }

      const refreshedThreads = await threadListRuntime.load();
      setThreads(refreshedThreads);
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Failed to send message.",
      );
    } finally {
      setSubmitting(false);
      setLiveAssistant(null);
    }
  }

  return (
    <AppShell activeThreadId={conversationId} threads={threads}>
      <section>
        <h1>{runtimeState?.title || "Assistant UI"}</h1>
        {loading ? <p>Loading...</p> : null}
        {error ? <p>{error}</p> : null}
        <ChatThread messages={displayMessages} />
        <form onSubmit={onSubmit}>
          <textarea
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask something..."
            rows={4}
            value={draft}
          />
          <button disabled={submitting} type="submit">
            {submitting ? "Sending..." : "Send"}
          </button>
        </form>
      </section>
    </AppShell>
  );
}
