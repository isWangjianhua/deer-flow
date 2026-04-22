"use client";

import type { Message } from "@langchain/langgraph-sdk";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import type { FileInMessage } from "@/core/messages/utils";
import type { LocalSettings } from "@/core/settings";
import type { AgentThreadState, WorkspaceThreadStream } from "@/core/threads";
import { buildAgentRunContext } from "@/core/threads/context";
import { promptInputFilePartToFile, uploadFiles } from "@/core/uploads";

import { createConversation, getConversation, streamMessage } from "./api";
import { createHumanMessage, toThreadMessages } from "./messages";
import { shouldClearPendingHumanMessages } from "./optimistic";
import { createInitialChatState, applyBffChatEvent } from "./state";
import { createBffStreamDecoder } from "./stream";
import { mergeConversationState, toConversationThreadState } from "./values";

type BffThreadStreamOptions = {
  conversationId?: string | null | undefined;
  context: LocalSettings["context"];
  createConversationForThread?: () => Promise<{ id: string }>;
  onStart?: (conversationId: string) => void;
  onFinish?: (state: AgentThreadState) => void;
};

type SendBffThreadMessageOptions = {
  optimistic?: boolean;
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

function mergeStableMessages(
  baseValues: AgentThreadState,
  chatState: ReturnType<typeof createInitialChatState>,
  humanMessages: Message[],
) {
  return {
    ...baseValues,
    messages: baseValues.messages.concat(toThreadMessages(chatState, humanMessages)),
  };
}

export function useBffThreadStream({
  conversationId,
  context,
  createConversationForThread = createConversation,
  onStart,
  onFinish,
}: BffThreadStreamOptions): [
  WorkspaceThreadStream,
  (
    conversationId: string,
    message: PromptInputMessage,
    options?: SendBffThreadMessageOptions,
  ) => Promise<void>,
  boolean,
] {
  const [humanMessages, setHumanMessages] = useState<Message[]>([]);
  const [chatState, setChatState] = useState(createInitialChatState);
  const [baseValues, setBaseValues] = useState<AgentThreadState>(
    createEmptyThreadState([]),
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isThreadLoading, setIsThreadLoading] = useState(
    () => conversationId != null,
  );
  const [error, setError] = useState<unknown>(undefined);
  const queryClient = useQueryClient();
  const activeConversationIdRef = useRef<string | null>(conversationId ?? null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const sendInFlightRef = useRef(false);
  const lastFinishedIdRef = useRef<string | null>(null);
  const prevBaseMessageCountRef = useRef(0);
  const finishThread = useCallback(
    (state: AgentThreadState) => {
      onFinish?.(state);
    },
    [onFinish],
  );

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
    setIsUploading(false);
    setIsThreadLoading(!!nextConversationId);
    setError(undefined);
    abortControllerRef.current = null;
    sendInFlightRef.current = false;
    lastFinishedIdRef.current = null;
    prevBaseMessageCountRef.current = 0;
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
        setBaseValues(toConversationThreadState(conversation));
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

  useEffect(() => {
    if (
      shouldClearPendingHumanMessages({
        pendingHumanMessages: humanMessages.length,
        baseMessageCount: baseValues.messages.length,
        previousBaseMessageCount: prevBaseMessageCountRef.current,
      })
    ) {
      setHumanMessages([]);
      prevBaseMessageCountRef.current = baseValues.messages.length;
    }
  }, [baseValues.messages.length, humanMessages.length]);

  const sendMessage = useCallback(
    async (
      _conversationId: string,
      message: PromptInputMessage,
      options: SendBffThreadMessageOptions = {},
    ) => {
      if (sendInFlightRef.current) {
        return;
      }

      const optimistic = options.optimistic ?? true;
      const text = message.text.trim();
      const hasFiles = (message.files?.length ?? 0) > 0;
      if (!text && !hasFiles) {
        return;
      }

      sendInFlightRef.current = true;
      setError(undefined);
      setIsLoading(true);
      prevBaseMessageCountRef.current = baseValues.messages.length;
      const humanMessageId = `bff-human-${Date.now()}`;
      const optimisticFiles: FileInMessage[] =
        message.files?.map((file) => ({
          filename: file.filename ?? file.file?.name ?? "attachment",
          size: file.file?.size ?? 0,
          status: "uploading",
        })) ?? [];
      if (optimistic) {
        setHumanMessages((current) =>
          current.concat(createHumanMessage(text, optimisticFiles, humanMessageId)),
        );
      }

      try {
        let resolvedConversationId = activeConversationIdRef.current;
        if (!resolvedConversationId) {
          const created = await createConversationForThread();
          resolvedConversationId = created.id;
          activeConversationIdRef.current = resolvedConversationId;
          void queryClient.invalidateQueries({ queryKey: ["bff", "conversations"] });
          onStart?.(resolvedConversationId);
        }

        if (hasFiles) {
          setIsUploading(true);
          try {
            const messageFiles = message.files ?? [];
            const conversionResults = await Promise.all(
              messageFiles.map((file) => promptInputFilePartToFile(file)),
            );
            const files = conversionResults.filter(
              (file): file is File => file !== null,
            );
            const failedConversions = conversionResults.length - files.length;

            if (failedConversions > 0) {
              throw new Error(
                `Failed to prepare ${failedConversions} attachment(s) for upload. Please retry.`,
              );
            }

            const uploadResponse =
              files.length > 0
                ? await uploadFiles(resolvedConversationId, files, { apiMode: "bff" })
                : { files: [] };
            const uploadedFiles: FileInMessage[] = uploadResponse.files.map(
              (info) => ({
                filename: info.filename,
                size: Number(info.size) || 0,
                path: info.virtual_path,
                status: "uploaded" as const,
              }),
            );

            if (optimistic) {
              setHumanMessages((current) =>
                current.map((entry) =>
                  entry.id === humanMessageId
                    ? createHumanMessage(text, uploadedFiles, humanMessageId)
                    : entry,
                ),
              );
            }
          } finally {
            setIsUploading(false);
          }
        }

        const abortController = new AbortController();
        abortControllerRef.current = abortController;
        const stream = await streamMessage({
          conversationId: resolvedConversationId,
          message: text,
          context: buildAgentRunContext(context),
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
        if (optimistic) {
          setHumanMessages((current) =>
            current.filter((entry) => entry.id !== humanMessageId),
          );
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
    [
      baseValues.messages.length,
      context,
      createConversationForThread,
      onStart,
      queryClient,
    ],
  );

  useEffect(() => {
    const lastMessage = chatState.messages[chatState.messages.length - 1];
    if (
      lastMessage?.status === "completed" &&
      lastMessage.id !== lastFinishedIdRef.current
    ) {
      lastFinishedIdRef.current = lastMessage.id;
      const nextValues = mergeStableMessages(baseValues, chatState, humanMessages);
      setBaseValues(nextValues);
      setHumanMessages([]);
      setChatState(createInitialChatState());
      void queryClient.invalidateQueries({ queryKey: ["bff", "conversations"] });

      const activeConversationId = activeConversationIdRef.current;
      if (activeConversationId) {
        void getConversation(activeConversationId)
        .then((conversation) => {
          const refreshedValues = mergeConversationState(
            nextValues,
            conversation,
          );
          prevBaseMessageCountRef.current = refreshedValues.messages.length;
          setBaseValues(refreshedValues);
          finishThread(refreshedValues);
        })
        .catch(() => {
          prevBaseMessageCountRef.current = nextValues.messages.length;
          finishThread(nextValues);
        });
      } else {
        prevBaseMessageCountRef.current = nextValues.messages.length;
        finishThread(nextValues);
      }
    }
  }, [baseValues, chatState, finishThread, humanMessages, queryClient]);

  return [thread, sendMessage, isUploading];
}
