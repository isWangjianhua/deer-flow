"use client";

import type { Message } from "@langchain/langgraph-sdk";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import type { AgentThreadState, WorkspaceThreadStream } from "@/core/threads";

import { createConversation, getConversation, streamMessage } from "./api";
import { createHumanMessage, toThreadMessages } from "./messages";
import { createInitialChatState, applyBffChatEvent } from "./state";
import { createBffStreamDecoder } from "./stream";

type BffThreadStreamOptions = {
  conversationId?: string | null | undefined;
  onStart?: (conversationId: string) => void;
  onFinish?: (state: AgentThreadState) => void;
};

async function consumeBffStream(
  stream: ReadableStream<Uint8Array>,
  onEvent: (eventText: string) => void,
) {
  const reader = stream.getReader();
  const textDecoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        onEvent(textDecoder.decode());
        return;
      }
      onEvent(textDecoder.decode(value, { stream: true }));
    }
  } finally {
    reader.releaseLock();
  }
}

function createEmptyThreadState(messages: Message[]): AgentThreadState {
  return {
    title: "",
    messages,
    artifacts: [],
    todos: [],
  };
}

export function useBffThreadStream({
  conversationId,
  onStart,
  onFinish,
}: BffThreadStreamOptions): [
  WorkspaceThreadStream,
  (conversationId: string, message: PromptInputMessage) => Promise<void>,
  boolean,
] {
  const [humanMessages, setHumanMessages] = useState<Message[]>([]);
  const [chatState, setChatState] = useState(createInitialChatState);
  const [baseValues, setBaseValues] = useState<AgentThreadState>(
    createEmptyThreadState([]),
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isThreadLoading, setIsThreadLoading] = useState(false);
  const [error, setError] = useState<unknown>(undefined);
  const activeConversationIdRef = useRef<string | null>(conversationId ?? null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const sendInFlightRef = useRef(false);
  const lastFinishedIdRef = useRef<string | null>(null);

  const messages = useMemo(() => {
    return [
      ...baseValues.messages,
      ...toThreadMessages(chatState, humanMessages),
    ];
  }, [baseValues.messages, chatState, humanMessages]);

  const thread = useMemo<WorkspaceThreadStream>(() => {
    const values = {
      ...baseValues,
      messages,
    };
    return {
      messages,
      values,
      isLoading,
      isThreadLoading,
      error,
      async stop() {
        abortControllerRef.current?.abort();
      },
    };
  }, [baseValues, error, isLoading, isThreadLoading, messages]);

  useEffect(() => {
    const nextConversationId = conversationId ?? null;
    const currentConversationId = activeConversationIdRef.current;
    activeConversationIdRef.current = nextConversationId;
    if (
      nextConversationId &&
      currentConversationId &&
      nextConversationId === currentConversationId
    ) {
      return;
    }
    setHumanMessages([]);
    setChatState(createInitialChatState());
    setBaseValues(createEmptyThreadState([]));
    setIsLoading(false);
    setIsThreadLoading(false);
    setError(undefined);
    abortControllerRef.current = null;
    sendInFlightRef.current = false;
    lastFinishedIdRef.current = null;
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) {
      return;
    }

    let cancelled = false;
    setIsThreadLoading(true);

    void getConversation(conversationId)
      .then((conversation) => {
        if (cancelled) {
          return;
        }
        setBaseValues({
          title: conversation.values.title ?? conversation.title ?? "",
          messages: conversation.values.messages ?? [],
          artifacts: conversation.values.artifacts ?? [],
          todos: conversation.values.todos ?? [],
        });
      })
      .catch((loadError) => {
        if (cancelled) {
          return;
        }
        setError(loadError);
        toast.error(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load conversation",
        );
      })
      .finally(() => {
        if (!cancelled) {
          setIsThreadLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  const sendMessage = useCallback(
    async (_conversationId: string, message: PromptInputMessage) => {
      if (sendInFlightRef.current) {
        return;
      }

      const text = message.text.trim();
      if (!text) {
        return;
      }

      if ((message.files?.length ?? 0) > 0) {
        toast.error("Attachments are not supported in BFF chat yet.");
        return;
      }

      sendInFlightRef.current = true;
      setError(undefined);
      setHumanMessages((current) => current.concat(createHumanMessage(text)));
      setIsLoading(true);

      try {
        let resolvedConversationId = activeConversationIdRef.current;
        if (!resolvedConversationId) {
          const created = await createConversation();
          resolvedConversationId = created.id;
          activeConversationIdRef.current = resolvedConversationId;
          onStart?.(resolvedConversationId);
        }

        const abortController = new AbortController();
        abortControllerRef.current = abortController;
        const stream = await streamMessage({
          conversationId: resolvedConversationId,
          message: text,
          signal: abortController.signal,
        });
        const decoder = createBffStreamDecoder();

        await consumeBffStream(stream, (chunk) => {
          for (const event of decoder.push(chunk)) {
            if (event.type === "run.failed") {
              const streamError = new Error(event.data.message);
              setError(streamError);
              toast.error(event.data.message);
              continue;
            }
            setChatState((current) => applyBffChatEvent(current, event));
          }
        });

        for (const event of decoder.flush()) {
          if (event.type === "run.failed") {
            const streamError = new Error(event.data.message);
            setError(streamError);
            toast.error(event.data.message);
            continue;
          }
          setChatState((current) => applyBffChatEvent(current, event));
        }
      } catch (streamError) {
        if (
          streamError instanceof Error &&
          streamError.name === "AbortError"
        ) {
          return;
        }
        setError(streamError);
        toast.error(
          streamError instanceof Error
            ? streamError.message
            : "Failed to stream message",
        );
      } finally {
        abortControllerRef.current = null;
        sendInFlightRef.current = false;
        setIsLoading(false);
      }
    },
    [onStart],
  );

  useEffect(() => {
    const lastMessage = chatState.messages[chatState.messages.length - 1];
    if (
      lastMessage?.status === "completed" &&
      lastMessage.id !== lastFinishedIdRef.current
    ) {
      lastFinishedIdRef.current = lastMessage.id;
      onFinish?.(createEmptyThreadState(toThreadMessages(chatState, humanMessages)));
    }
  }, [chatState, humanMessages, onFinish]);

  return [thread, sendMessage, false];
}
