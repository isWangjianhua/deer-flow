"use client";

import type { Message } from "@langchain/langgraph-sdk";
import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import { type PromptInputMessage } from "@/components/ai-elements/prompt-input";
import { PromptInputProvider } from "@/components/ai-elements/prompt-input";
import { LoginRequiredDialog } from "@/components/auth/login-required-dialog";
import { useLoginRequiredSubmit } from "@/components/auth/use-login-required-submit";
import { ArtifactTrigger } from "@/components/workspace/artifacts";
import { ArtifactsProvider } from "@/components/workspace/artifacts";
import { ExportTrigger } from "@/components/workspace/export-trigger";
import { InputBox } from "@/components/workspace/input-box";
import {
  MessageList,
  MESSAGE_LIST_DEFAULT_PADDING_BOTTOM,
  MESSAGE_LIST_FOLLOWUPS_EXTRA_PADDING_BOTTOM,
} from "@/components/workspace/messages";
import { ThreadContext } from "@/components/workspace/messages/context";
import { ThreadTitle } from "@/components/workspace/thread-title";
import { TodoList } from "@/components/workspace/todo-list";
import { TokenUsageIndicator } from "@/components/workspace/token-usage-indicator";
import { Welcome } from "@/components/workspace/welcome";
import { generateSuggestions, useBffThreadStream } from "@/core/bff-chat";
import { useI18n } from "@/core/i18n/hooks";
import { useNotification } from "@/core/notification/hooks";
import { useThreadSettings } from "@/core/settings";
import { SubtasksProvider } from "@/core/tasks/context";
import type { AgentThreadState } from "@/core/threads";
import { useThreadStream } from "@/core/threads/hooks";
import { textOfMessage } from "@/core/threads/utils";
import { env } from "@/env";
import { cn } from "@/lib/utils";

import { ChatBox } from "./chat-box";
import { useSpecificChatMode } from "./use-chat-mode";
import { useThreadChat } from "./use-thread-chat";

function buildFollowupMessages(
  messages: Message[],
): Array<{ role: "user" | "assistant"; content: string }> {
  return messages
    .filter((message) => message.type === "human" || message.type === "ai")
    .map((message): { role: "user" | "assistant"; content: string } => ({
      role: message.type === "human" ? "user" : "assistant",
      content: textOfMessage(message) ?? "",
    }))
    .filter((message) => message.content.trim().length > 0)
    .slice(-6);
}

function getLastAiMessageId(messages: Message[]) {
  return [...messages].reverse().find((message) => message.type === "ai")?.id ?? null;
}

function buildCompletionNotificationBody(state: AgentThreadState) {
  const body = "Conversation finished";
  const lastMessage = state.messages.at(-1);
  if (!lastMessage) {
    return body;
  }

  const textContent = textOfMessage(lastMessage);
  if (!textContent) {
    return body;
  }

  return textContent.length > 200
    ? textContent.substring(0, 200) + "..."
    : textContent;
}

function MockChatPageContent({
  threadId,
  setThreadId,
  isNewThread,
  setIsNewThread,
}: {
  threadId: string;
  setThreadId: (threadId: string) => void;
  isNewThread: boolean;
  setIsNewThread: (isNewThread: boolean) => void;
}) {
  const { t } = useI18n();
  const [showFollowups, setShowFollowups] = useState(false);
  const [settings, setSettings] = useThreadSettings(threadId);
  const [mounted, setMounted] = useState(false);
  const { showNotification } = useNotification();
  const {
    dialogOpen,
    setDialogOpen,
    callbackURL,
    restoredText,
    handleRestoredTextApplied,
    handleAuthenticated,
    handleBeforeOidcRedirect,
    guardSubmit,
  } = useLoginRequiredSubmit();

  useEffect(() => {
    setMounted(true);
  }, []);

  const [thread, sendMessage, isUploading] = useThreadStream({
    threadId: isNewThread ? undefined : threadId,
    context: settings.context,
    isMock: true,
    onStart: (createdThreadId) => {
      setThreadId(createdThreadId);
      setIsNewThread(false);
      history.replaceState(null, "", `/workspace/chats/${createdThreadId}`);
    },
    onFinish: (state) => {
      if (document.hidden || !document.hasFocus()) {
        showNotification(state.title, {
          body: buildCompletionNotificationBody(state),
        });
      }
    },
  });

  const handleSubmit = useCallback(
    (message: PromptInputMessage) => {
      return guardSubmit(message, (nextMessage) => {
        void sendMessage(threadId, nextMessage).catch(() => undefined);
      });
    },
    [guardSubmit, sendMessage, threadId],
  );

  const handleStop = useCallback(async () => {
    await thread.stop();
  }, [thread]);

  const messageListPaddingBottom = showFollowups
    ? MESSAGE_LIST_DEFAULT_PADDING_BOTTOM +
      MESSAGE_LIST_FOLLOWUPS_EXTRA_PADDING_BOTTOM
    : undefined;

  return (
    <ThreadContext.Provider
      value={{ thread, isMock: true, apiMode: "gateway" }}
    >
      <ChatBox threadId={threadId}>
        <div className="relative flex size-full min-h-0 justify-between">
          <header
            className={cn(
              "absolute top-0 right-0 left-0 z-30 flex h-12 shrink-0 items-center px-4",
              isNewThread
                ? "bg-background/0 backdrop-blur-none"
                : "bg-background/80 shadow-xs backdrop-blur",
            )}
          >
            <div className="flex w-full items-center text-sm font-medium">
              <ThreadTitle threadId={threadId} thread={thread} />
            </div>
            <div className="flex items-center gap-2">
              <TokenUsageIndicator messages={thread.messages} />
              <ExportTrigger threadId={threadId} />
              <ArtifactTrigger />
            </div>
          </header>
          <main className="flex min-h-0 max-w-full grow flex-col">
            <div className="flex size-full justify-center">
              <MessageList
                className={cn("size-full", !isNewThread && "pt-10")}
                threadId={threadId}
                thread={thread}
                paddingBottom={messageListPaddingBottom}
              />
            </div>
            <div className="absolute right-0 bottom-0 left-0 z-30 flex justify-center px-4">
              <div
                className={cn(
                  "relative w-full",
                  isNewThread && "-translate-y-[calc(50vh-96px)]",
                  isNewThread
                    ? "max-w-(--container-width-sm)"
                    : "max-w-(--container-width-md)",
                )}
              >
                <div className="absolute -top-4 right-0 left-0 z-0">
                  <div className="absolute right-0 bottom-0 left-0">
                    <TodoList
                      className="bg-background/5"
                      todos={thread.values.todos ?? []}
                      hidden={
                        !thread.values.todos || thread.values.todos.length === 0
                      }
                    />
                  </div>
                </div>
                {mounted ? (
                  <InputBox
                    className={cn("bg-background/5 w-full -translate-y-4")}
                    isNewThread={isNewThread}
                    threadId={threadId}
                    autoFocus={isNewThread}
                    status={
                      thread.error
                        ? "error"
                        : thread.isLoading
                          ? "streaming"
                          : "ready"
                    }
                    context={settings.context}
                    restoredText={restoredText}
                    onRestoredTextApplied={handleRestoredTextApplied}
                    extraHeader={
                      isNewThread && <Welcome mode={settings.context.mode} />
                    }
                    disabled={
                      env.NEXT_PUBLIC_STATIC_WEBSITE_ONLY === "true" ||
                      isUploading
                    }
                    onContextChange={(context) =>
                      setSettings("context", context)
                    }
                    onFollowupsVisibilityChange={setShowFollowups}
                    onSubmit={handleSubmit}
                    onStop={handleStop}
                  />
                ) : (
                  <div
                    aria-hidden="true"
                    className={cn(
                      "bg-background/5 h-32 w-full -translate-y-4 rounded-2xl border",
                    )}
                  />
                )}
                <LoginRequiredDialog
                  open={dialogOpen}
                  onOpenChange={setDialogOpen}
                  onAuthenticated={handleAuthenticated}
                  callbackURL={callbackURL}
                  onBeforeOidcRedirect={handleBeforeOidcRedirect}
                />
                {env.NEXT_PUBLIC_STATIC_WEBSITE_ONLY === "true" && (
                  <div className="text-muted-foreground/67 w-full translate-y-12 text-center text-xs">
                    {t.common.notAvailableInDemoMode}
                  </div>
                )}
              </div>
            </div>
          </main>
        </div>
      </ChatBox>
    </ThreadContext.Provider>
  );
}

function BffChatPageContent({
  threadId,
  setThreadId,
  isNewThread,
  setIsNewThread,
}: {
  threadId: string;
  setThreadId: (threadId: string) => void;
  isNewThread: boolean;
  setIsNewThread: (isNewThread: boolean) => void;
}) {
  const { t } = useI18n();
  const [showFollowups, setShowFollowups] = useState(false);
  const [settings, setSettings] = useThreadSettings(threadId);
  const [mounted, setMounted] = useState(false);
  const { showNotification } = useNotification();
  const [followupSuggestions, setFollowupSuggestions] = useState<string[]>([]);
  const [followupRequestId, setFollowupRequestId] = useState<string | null>(null);
  const latestFollowupRequestIdRef = useRef<string | null>(null);
  const lastGeneratedForAiIdRef = useRef<string | null>(null);
  const {
    dialogOpen,
    setDialogOpen,
    callbackURL,
    restoredText,
    handleRestoredTextApplied,
    handleAuthenticated,
    handleBeforeOidcRedirect,
    guardSubmit,
  } = useLoginRequiredSubmit();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setFollowupSuggestions([]);
    setFollowupRequestId(null);
    latestFollowupRequestIdRef.current = null;
    lastGeneratedForAiIdRef.current = null;
  }, [threadId]);

  const {
    mutate: requestFollowups,
    isPending: followupLoading,
  } = useMutation({
    mutationFn: async ({
      conversationId,
      requestId,
      messages,
      modelName,
    }: {
      conversationId: string;
      requestId: string;
      messages: Array<{ role: "user" | "assistant"; content: string }>;
      modelName?: string;
    }) => {
      const suggestions = await generateSuggestions({
        conversationId,
        messages,
        modelName,
      });

      return { requestId, suggestions };
    },
    onSuccess: ({ requestId, suggestions }) => {
      if (latestFollowupRequestIdRef.current !== requestId) {
        return;
      }
      setFollowupSuggestions(suggestions);
    },
    onError: (_error, variables) => {
      if (latestFollowupRequestIdRef.current !== variables.requestId) {
        return;
      }
      setFollowupSuggestions([]);
    },
  });

  const [thread, sendMessage, isUploading] = useBffThreadStream({
    conversationId: isNewThread ? undefined : threadId,
    context: settings.context,
    onStart: (createdConversationId) => {
      setThreadId(createdConversationId);
      setIsNewThread(false);
      history.replaceState(
        null,
        "",
        `/workspace/chats/${createdConversationId}`,
      );
    },
    onFinish: (state) => {
      if (document.hidden || !document.hasFocus()) {
        showNotification(state.title, {
          body: buildCompletionNotificationBody(state),
        });
      }

      const lastAiId = getLastAiMessageId(state.messages);
      if (!lastAiId || lastAiId === lastGeneratedForAiIdRef.current) {
        return;
      }

      const recentMessages = buildFollowupMessages(state.messages);
      if (recentMessages.length === 0) {
        return;
      }

      lastGeneratedForAiIdRef.current = lastAiId;
      latestFollowupRequestIdRef.current = lastAiId;
      setFollowupRequestId(lastAiId);
      setFollowupSuggestions([]);
      requestFollowups({
        conversationId: threadId,
        requestId: lastAiId,
        messages: recentMessages,
        modelName: settings.context.model_name,
      });
    },
  });

  const handleSubmit = useCallback(
    (message: PromptInputMessage) => {
      setFollowupSuggestions([]);
      setFollowupRequestId(null);
      latestFollowupRequestIdRef.current = null;
      return guardSubmit(message, (nextMessage) => {
        void sendMessage(threadId, nextMessage).catch(() => undefined);
      });
    },
    [guardSubmit, sendMessage, threadId],
  );

  const handleStop = useCallback(async () => {
    await thread.stop();
  }, [thread]);

  const messageListPaddingBottom = showFollowups
    ? MESSAGE_LIST_DEFAULT_PADDING_BOTTOM +
      MESSAGE_LIST_FOLLOWUPS_EXTRA_PADDING_BOTTOM
    : undefined;

  return (
    <ThreadContext.Provider value={{ thread, isMock: false, apiMode: "bff" }}>
      <ChatBox threadId={threadId}>
        <div className="relative flex size-full min-h-0 justify-between">
          <header
            className={cn(
              "absolute top-0 right-0 left-0 z-30 flex h-12 shrink-0 items-center px-4",
              isNewThread
                ? "bg-background/0 backdrop-blur-none"
                : "bg-background/80 shadow-xs backdrop-blur",
            )}
          >
            <div className="flex w-full items-center text-sm font-medium">
              <ThreadTitle threadId={threadId} thread={thread} />
            </div>
            <div className="flex items-center gap-2">
              <TokenUsageIndicator messages={thread.messages} />
              <ExportTrigger threadId={threadId} />
              <ArtifactTrigger />
            </div>
          </header>
          <main className="flex min-h-0 max-w-full grow flex-col">
            <div className="flex size-full justify-center">
              <MessageList
                className={cn("size-full", !isNewThread && "pt-10")}
                threadId={threadId}
                thread={thread}
                paddingBottom={messageListPaddingBottom}
              />
            </div>
            <div className="absolute right-0 bottom-0 left-0 z-30 flex justify-center px-4">
              <div
                className={cn(
                  "relative w-full",
                  isNewThread && "-translate-y-[calc(50vh-96px)]",
                  isNewThread
                    ? "max-w-(--container-width-sm)"
                    : "max-w-(--container-width-md)",
                )}
              >
                <div className="absolute -top-4 right-0 left-0 z-0">
                  <div className="absolute right-0 bottom-0 left-0">
                    <TodoList
                      className="bg-background/5"
                      todos={thread.values.todos ?? []}
                      hidden={
                        !thread.values.todos || thread.values.todos.length === 0
                      }
                    />
                  </div>
                </div>
                {mounted ? (
                  <InputBox
                    className={cn("bg-background/5 w-full -translate-y-4")}
                    isNewThread={isNewThread}
                    threadId={threadId}
                    autoFocus={isNewThread}
                    status={
                      thread.error
                        ? "error"
                        : thread.isLoading
                          ? "streaming"
                          : "ready"
                    }
                    context={settings.context}
                    restoredText={restoredText}
                    onRestoredTextApplied={handleRestoredTextApplied}
                    extraHeader={
                      isNewThread && <Welcome mode={settings.context.mode} />
                    }
                    disabled={
                      env.NEXT_PUBLIC_STATIC_WEBSITE_ONLY === "true" ||
                      isUploading
                    }
                    onContextChange={(context) =>
                      setSettings("context", context)
                    }
                    externalFollowups={followupSuggestions}
                    externalFollowupsLoading={followupLoading}
                    externalFollowupsRequestId={followupRequestId}
                    onFollowupsVisibilityChange={setShowFollowups}
                    onSubmit={handleSubmit}
                    onStop={handleStop}
                  />
                ) : (
                  <div
                    aria-hidden="true"
                    className={cn(
                      "bg-background/5 h-32 w-full -translate-y-4 rounded-2xl border",
                    )}
                  />
                )}
                <LoginRequiredDialog
                  open={dialogOpen}
                  onOpenChange={setDialogOpen}
                  onAuthenticated={handleAuthenticated}
                  callbackURL={callbackURL}
                  onBeforeOidcRedirect={handleBeforeOidcRedirect}
                />
                {env.NEXT_PUBLIC_STATIC_WEBSITE_ONLY === "true" && (
                  <div className="text-muted-foreground/67 w-full translate-y-12 text-center text-xs">
                    {t.common.notAvailableInDemoMode}
                  </div>
                )}
              </div>
            </div>
          </main>
        </div>
      </ChatBox>
    </ThreadContext.Provider>
  );
}

function ChatPageInner() {
  const { threadId, setThreadId, isNewThread, setIsNewThread, isMock } =
    useThreadChat();

  useSpecificChatMode();

  return isMock ? (
    <MockChatPageContent
      threadId={threadId}
      setThreadId={setThreadId}
      isNewThread={isNewThread}
      setIsNewThread={setIsNewThread}
    />
  ) : (
    <BffChatPageContent
      threadId={threadId}
      setThreadId={setThreadId}
      isNewThread={isNewThread}
      setIsNewThread={setIsNewThread}
    />
  );
}

export default function ChatPage() {
  return (
    <SubtasksProvider>
      <ArtifactsProvider>
        <PromptInputProvider>
          <ChatPageInner />
        </PromptInputProvider>
      </ArtifactsProvider>
    </SubtasksProvider>
  );
}
