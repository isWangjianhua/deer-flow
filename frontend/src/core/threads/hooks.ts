import { useChat } from "@ai-sdk/react";
import type { Message } from "@langchain/langgraph-sdk";
import type { ThreadsClient } from "@langchain/langgraph-sdk/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";

import {
  createConversation,
  listConversations,
  updateConversation,
} from "../chat/api";
import type { ConversationSummary } from "../chat/types";
import { getBackendBaseURL } from "../config";
import { useI18n } from "../i18n/hooks";
import type { FileInMessage } from "../messages/utils";
import type { LocalSettings } from "../settings";
import type { UploadedFileInfo } from "../uploads";
import { uploadFiles } from "../uploads";

import type { AgentThread, AgentThreadState, ThreadStreamLike } from "./types";

export type ToolEndEvent = {
  name: string;
  data: unknown;
};

function conversationToAgentThread(
  conversation: ConversationSummary,
): AgentThread {
  return {
    thread_id: conversation.conversation_id,
    created_at: conversation.created_at,
    updated_at: conversation.updated_at,
    status: "idle",
    metadata: {},
    interrupts: {},
    values: {
      title: conversation.title,
      messages: [],
      artifacts: [],
      todos: [],
    },
  } as AgentThread;
}

function isConversationDataPart(
  dataPart: { type: `data-${string}`; id?: string; data: unknown },
): dataPart is {
  type: "data-conversation";
  id?: string;
  data: { conversationId?: string };
} {
  return dataPart.type === "data-conversation";
}

export type ThreadStreamOptions = {
  threadId?: string | null | undefined;
  context: LocalSettings["context"];
  isMock?: boolean;
  onStart?: (threadId: string) => void;
  onFinish?: (state: AgentThreadState) => void;
  onToolEnd?: (event: ToolEndEvent) => void;
};

type ThreadStateResponse = {
  values?: Partial<AgentThreadState>;
};

function bytesToDisplaySize(bytes: number): string {
  const kb = bytes / 1024;
  return kb < 1024 ? `${kb.toFixed(1)} KB` : `${(kb / 1024).toFixed(1)} MB`;
}

function buildUploadedFilesBlock(files: UploadedFileInfo[]): string {
  const lines = ["<uploaded_files>", "The following files were uploaded in this message:", ""];
  if (files.length === 0) {
    lines.push("(empty)");
  } else {
    for (const file of files) {
      lines.push(`- ${file.filename} (${bytesToDisplaySize(file.size)})`);
      lines.push(`  Path: ${file.virtual_path}`);
      lines.push("");
    }
  }
  lines.push("You can read these files using the `read_file` tool with the paths shown above.");
  lines.push("</uploaded_files>");
  return lines.join("\n");
}

function extractTextFromUIMessage(message: UIMessage): string {
  return message.parts
    .map((part) => {
      if (part.type === "text") {
        return part.text;
      }
      return "";
    })
    .join("\n")
    .trim();
}

function legacyMessageToUIMessage(message: Message): UIMessage {
  const role =
    message.type === "human"
      ? "user"
      : message.type === "ai"
        ? "assistant"
        : "assistant";
  const text =
    typeof message.content === "string"
      ? message.content
      : Array.isArray(message.content)
        ? message.content
            .map((part) => ("text" in part ? part.text : ""))
            .join("\n")
            .trim()
        : "";
  return {
    id: String(message.id ?? crypto.randomUUID()),
    role,
    parts: text ? [{ type: "text", text }] : [],
  } as UIMessage;
}

function uiMessageToLegacyMessage(message: UIMessage): Message {
  const text = extractTextFromUIMessage(message);
  return {
    id: message.id,
    type: message.role === "user" ? "human" : "ai",
    content: text,
    additional_kwargs: {},
  } as Message;
}

async function fetchThreadState(threadId: string): Promise<AgentThreadState> {
  const response = await fetch(
    `${getBackendBaseURL()}/api/threads/${encodeURIComponent(threadId)}/state`,
  );
  if (!response.ok) {
    throw new Error("Failed to load conversation state.");
  }
  const payload = (await response.json()) as ThreadStateResponse;
  return {
    title: payload.values?.title ?? "",
    messages: payload.values?.messages ?? [],
    artifacts: payload.values?.artifacts ?? [],
    todos: payload.values?.todos ?? [],
  };
}

export function useThreadStream({
  threadId,
  context,
  isMock: _isMock,
  onStart,
  onFinish,
  onToolEnd,
}: ThreadStreamOptions) {
  const { t } = useI18n();
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(
    () => threadId ?? null,
  );
  const [threadValues, setThreadValues] = useState<AgentThreadState>({
    title: "",
    messages: [],
    artifacts: [],
    todos: [],
  });
  const [isThreadLoading, setIsThreadLoading] = useState(Boolean(threadId));
  const [stateError, setStateError] = useState<Error | undefined>(undefined);
  const threadIdRef = useRef<string | null>(threadId ?? null);
  const startedRef = useRef(false);
  const streamContextRef = useRef<Record<string, unknown>>({});
  const statusRef = useRef<string>("ready");

  const listeners = useRef({
    onStart,
    onFinish,
    onToolEnd,
  });

  // Keep listeners ref updated with latest callbacks
  useEffect(() => {
    listeners.current = { onStart, onFinish, onToolEnd };
  }, [onStart, onFinish, onToolEnd]);

  useEffect(() => {
    const normalizedThreadId = threadId ?? null;
    if (!normalizedThreadId) {
      startedRef.current = false;
      setCurrentConversationId(null);
      setThreadValues({
        title: "",
        messages: [],
        artifacts: [],
        todos: [],
      });
      setStateError(undefined);
      setIsThreadLoading(false);
    }
    threadIdRef.current = normalizedThreadId;
    setCurrentConversationId(normalizedThreadId);
  }, [threadId]);

  const _handleOnStart = useCallback((id: string) => {
    if (!startedRef.current) {
      listeners.current.onStart?.(id);
      startedRef.current = true;
    }
  }, []);

  const queryClient = useQueryClient();

  const refreshThreadState = useCallback(
    async (conversationId: string) => {
      setIsThreadLoading(true);
      try {
        const state = await fetchThreadState(conversationId);
        setThreadValues(state);
        setStateError(undefined);
        return state;
      } catch (error) {
        const normalized =
          error instanceof Error
            ? error
            : new Error("Failed to load conversation state.");
        setStateError(normalized);
        throw normalized;
      } finally {
        setIsThreadLoading(false);
      }
    },
    [],
  );

  const {
    messages: uiMessages,
    sendMessage: sendChatMessage,
    status,
    stop,
    setMessages,
    error,
  } = useChat({
    id: currentConversationId ?? "pending-conversation",
    messages: [],
    transport: new DefaultChatTransport({
      api: `${getBackendBaseURL()}/api/chat`,
      prepareSendMessagesRequest: ({ id, messages }) => ({
        body: {
          id,
          messages,
          body: {
            conversation_id: threadIdRef.current ?? undefined,
            ...streamContextRef.current,
          },
        },
      }),
    }),
    onData: (dataPart) => {
      if (!isConversationDataPart(dataPart)) {
        return;
      }
      const conversationId = dataPart.data?.conversationId;
      if (typeof conversationId === "string" && conversationId) {
        threadIdRef.current = conversationId;
        setCurrentConversationId(conversationId);
        _handleOnStart(conversationId);
      }
    },
  });

  useEffect(() => {
    if (!threadId) {
      void setMessages([]);
      return;
    }
    let cancelled = false;
    void refreshThreadState(threadId)
      .then((state) => {
        if (cancelled) {
          return;
        }
        void setMessages(state.messages.map(legacyMessageToUIMessage));
      })
      .catch(() => {
        if (!cancelled) {
          setThreadValues({
            title: "",
            messages: [],
            artifacts: [],
            todos: [],
          });
          setStateError(undefined);
          void setMessages([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [refreshThreadState, setMessages, threadId]);

  useEffect(() => {
    const previousStatus = statusRef.current;
    statusRef.current = status;
    if (
      previousStatus !== status &&
      previousStatus !== "ready" &&
      status === "ready" &&
      threadIdRef.current
    ) {
      void refreshThreadState(threadIdRef.current)
        .then((state) => {
          listeners.current.onFinish?.(state);
          void queryClient.invalidateQueries({ queryKey: ["threads", "search"] });
        })
        .catch(() => {
          void queryClient.invalidateQueries({ queryKey: ["threads", "search"] });
        });
    }
  }, [queryClient, refreshThreadState, status]);

  // Optimistic messages shown before the server stream responds
  const [optimisticMessages, setOptimisticMessages] = useState<Message[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const sendInFlightRef = useRef(false);
  const legacyMessages = useMemo(
    () => uiMessages.map(uiMessageToLegacyMessage),
    [uiMessages],
  );
  const prevMsgCountRef = useRef(legacyMessages.length);

  useEffect(() => {
    if (
      optimisticMessages.length > 0 &&
      legacyMessages.length > prevMsgCountRef.current
    ) {
      setOptimisticMessages([]);
    }
  }, [legacyMessages.length, optimisticMessages.length]);

  const sendMessage = useCallback(
    async (
      _threadId: string,
      message: PromptInputMessage,
      extraContext?: Record<string, unknown>,
    ) => {
      if (sendInFlightRef.current) {
        return;
      }
      sendInFlightRef.current = true;

      const text = message.text.trim();

      prevMsgCountRef.current = legacyMessages.length;

      const optimisticFiles: FileInMessage[] = (message.files ?? []).map(
        (f) => ({
          filename: f.filename ?? "",
          size: 0,
          status: "uploading" as const,
        }),
      );

      const optimisticHumanMsg: Message = {
        type: "human",
        id: `opt-human-${Date.now()}`,
        content: text ? [{ type: "text", text }] : "",
        additional_kwargs:
          optimisticFiles.length > 0 ? { files: optimisticFiles } : {},
      };

      const newOptimistic: Message[] = [optimisticHumanMsg];
      if (optimisticFiles.length > 0) {
        // Mock AI message while files are being uploaded
        newOptimistic.push({
          type: "ai",
          id: `opt-ai-${Date.now()}`,
          content: t.uploads.uploadingFiles,
          additional_kwargs: { element: "task" },
        });
      }
      setOptimisticMessages(newOptimistic);

      let uploadedFileInfo: UploadedFileInfo[] = [];

      try {
        let resolvedConversationId = threadIdRef.current;
        if (!resolvedConversationId) {
          const conversation = await createConversation();
          resolvedConversationId = conversation.conversation_id;
          threadIdRef.current = resolvedConversationId;
          setCurrentConversationId(resolvedConversationId);
          _handleOnStart(resolvedConversationId);
        }

        if (message.files && message.files.length > 0) {
          setIsUploading(true);
          try {
            const filePromises = message.files.map(async (fileUIPart) => {
              if (fileUIPart.url && fileUIPart.filename) {
                try {
                  const response = await fetch(fileUIPart.url);
                  const blob = await response.blob();
                  return new File([blob], fileUIPart.filename, {
                    type: fileUIPart.mediaType || blob.type,
                  });
                } catch (error) {
                  console.error(
                    `Failed to fetch file ${fileUIPart.filename}:`,
                    error,
                  );
                  return null;
                }
              }
              return null;
            });

            const conversionResults = await Promise.all(filePromises);
            const files = conversionResults.filter(
              (file): file is File => file !== null,
            );
            const failedConversions = conversionResults.length - files.length;

            if (failedConversions > 0) {
              throw new Error(
                `Failed to prepare ${failedConversions} attachment(s) for upload. Please retry.`,
              );
            }

            if (!resolvedConversationId) {
              throw new Error("Thread is not ready for file upload.");
            }

            if (files.length > 0) {
              const uploadResponse = await uploadFiles(resolvedConversationId, files);
              uploadedFileInfo = uploadResponse.files;

              const uploadedFiles: FileInMessage[] = uploadedFileInfo.map(
                (info) => ({
                  filename: info.filename,
                  size: info.size,
                  path: info.virtual_path,
                  status: "uploaded" as const,
                }),
              );
              setOptimisticMessages((messages) => {
                if (messages.length > 1 && messages[0]) {
                  const humanMessage: Message = messages[0];
                  return [
                    {
                      ...humanMessage,
                      additional_kwargs: { files: uploadedFiles },
                    },
                    ...messages.slice(1),
                  ];
                }
                return messages;
              });
            }
          } catch (error) {
            console.error("Failed to upload files:", error);
            const errorMessage =
              error instanceof Error
                ? error.message
                : "Failed to upload files.";
            toast.error(errorMessage);
            setOptimisticMessages([]);
            throw error;
          } finally {
            setIsUploading(false);
          }
        }

        streamContextRef.current = {
          ...extraContext,
          ...context,
          thinking_enabled: context.mode !== "flash",
          is_plan_mode: context.mode === "pro" || context.mode === "ultra",
          subagent_enabled: context.mode === "ultra",
          reasoning_effort:
            context.reasoning_effort ??
            (context.mode === "ultra"
              ? "high"
              : context.mode === "pro"
                ? "medium"
                : context.mode === "thinking"
                  ? "low"
                  : undefined),
          thread_id: resolvedConversationId,
        };

        const uploadedFilesPrefix =
          uploadedFileInfo.length > 0
            ? `${buildUploadedFilesBlock(uploadedFileInfo)}\n\n`
            : "";

        setOptimisticMessages([]);
        await sendChatMessage({ text: `${uploadedFilesPrefix}${text}` });
        void queryClient.invalidateQueries({ queryKey: ["threads", "search"] });
      } catch (error) {
        setOptimisticMessages([]);
        setIsUploading(false);
        throw error;
      } finally {
        sendInFlightRef.current = false;
      }
    },
    [legacyMessages.length, _handleOnStart, t.uploads.uploadingFiles, context, queryClient, sendChatMessage],
  );

  const mergedMessages =
    optimisticMessages.length > 0
      ? [...legacyMessages, ...optimisticMessages]
      : legacyMessages;

  const mergedThread: ThreadStreamLike = {
    messages: mergedMessages,
    values: {
      ...threadValues,
      messages: legacyMessages,
    },
    error:
      error instanceof Error
        ? error
        : stateError,
    isLoading: status === "submitted" || status === "streaming",
    isThreadLoading,
    stop: async () => {
      await Promise.resolve(stop());
    },
  };

  return [mergedThread, sendMessage, isUploading] as const;
}

export function useThreads(
  _params: Parameters<ThreadsClient["search"]>[0] = {
    limit: 50,
    sortBy: "updated_at",
    sortOrder: "desc",
    select: ["thread_id", "updated_at", "values"],
  },
) {
  return useQuery<AgentThread[]>({
    queryKey: ["threads", "search", _params],
    queryFn: async () => {
      const conversations = await listConversations();
      return conversations.map(conversationToAgentThread);
    },
    refetchOnWindowFocus: false,
  });
}

export function useDeleteThread() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ threadId }: { threadId: string }) => {
      const response = await fetch(
        `${getBackendBaseURL()}/api/threads/${encodeURIComponent(threadId)}`,
        {
          method: "DELETE",
        },
      );

      if (!response.ok) {
        const error = await response
          .json()
          .catch(() => ({ detail: "Failed to delete thread data." }));
        throw new Error(error.detail ?? "Failed to delete thread data.");
      }
    },
    onSuccess(_, { threadId }) {
      queryClient.setQueriesData(
        {
          queryKey: ["threads", "search"],
          exact: false,
        },
        (oldData: Array<AgentThread> | undefined) => {
          if (oldData == null) {
            return oldData;
          }
          return oldData.filter((t) => t.thread_id !== threadId);
        },
      );
    },
    onSettled() {
      void queryClient.invalidateQueries({ queryKey: ["threads", "search"] });
    },
  });
}

export function useRenameThread() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      threadId,
      title,
    }: {
      threadId: string;
      title: string;
    }) => {
      await updateConversation(threadId, title);
    },
    onSuccess(_, { threadId, title }) {
      queryClient.setQueriesData(
        {
          queryKey: ["threads", "search"],
          exact: false,
        },
        (oldData: Array<AgentThread>) => {
          return oldData.map((t) => {
            if (t.thread_id === threadId) {
              return {
                ...t,
                values: {
                  ...t.values,
                  title,
                },
              };
            }
            return t;
          });
        },
      );
    },
  });
}
