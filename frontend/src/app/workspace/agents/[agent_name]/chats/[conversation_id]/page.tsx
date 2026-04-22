"use client";

import { BotIcon, PlusSquare, SaveIcon } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import { LoginRequiredDialog } from "@/components/auth/login-required-dialog";
import { useLoginRequiredSubmit } from "@/components/auth/use-login-required-submit";
import { Button } from "@/components/ui/button";
import { AgentWelcome } from "@/components/workspace/agent-welcome";
import { AgentsDisabledState } from "@/components/workspace/agents/agents-disabled-state";
import { ArtifactTrigger } from "@/components/workspace/artifacts";
import { ChatBox } from "@/components/workspace/chats";
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
import { Tooltip } from "@/components/workspace/tooltip";
import { useAgent } from "@/core/agents";
import { isAgentsUiEnabled } from "@/core/agents/feature";
import { createAgentConversation, useBffThreadStream } from "@/core/bff-chat";
import { useI18n } from "@/core/i18n/hooks";
import { useNotification } from "@/core/notification/hooks";
import { useThreadSettings } from "@/core/settings";
import { textOfMessage } from "@/core/threads/utils";
import { env } from "@/env";
import { cn } from "@/lib/utils";

function AgentChatPageEnabled() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showNotification } = useNotification();
  const [showFollowups, setShowFollowups] = useState(false);
  const bootstrapSentRef = useRef(false);
  const params = useParams<{
    agent_name: string;
    conversation_id: string;
  }>();
  const agentName = params.agent_name;
  const { conversation_id: conversationIdFromPath } = params;
  const [conversationId, setConversationId] = useState(conversationIdFromPath);
  const bootstrapRequested = searchParams.get("bootstrap") === "1";

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

  const { agent } = useAgent(agentName);
  const [settings, setSettings] = useThreadSettings(conversationId);

  useEffect(() => {
    if (conversationIdFromPath === "new") {
      return;
    }
    setConversationId(conversationIdFromPath);
  }, [conversationIdFromPath]);

  const [thread, sendMessage, isUploading] = useBffThreadStream({
    conversationId: conversationId === "new" ? undefined : conversationId,
    context: settings.context,
    createConversationForThread: () => createAgentConversation(agentName),
    onStart: (createdConversationId) => {
      setConversationId(createdConversationId);
      history.replaceState(
        null,
        "",
        `/workspace/agents/${agentName}/chats/${createdConversationId}`,
      );
    },
    onFinish: (state) => {
      if (document.hidden || !document.hasFocus()) {
        let body = "Conversation finished";
        const lastMessage = state.messages[state.messages.length - 1];
        if (lastMessage) {
          const textContent = textOfMessage(lastMessage);
          if (textContent) {
            body =
              textContent.length > 200
                ? textContent.substring(0, 200) + "..."
                : textContent;
          }
        }
        showNotification(state.title, { body });
      }
    },
  });

  useEffect(() => {
    bootstrapSentRef.current = false;
  }, [bootstrapRequested, conversationIdFromPath]);

  useEffect(() => {
    if (!bootstrapRequested || bootstrapSentRef.current) {
      return;
    }
    if (conversationIdFromPath === "new" || thread.isThreadLoading) {
      return;
    }
    if (thread.messages.length > 0) {
      history.replaceState(
        null,
        "",
        `/workspace/agents/${agentName}/chats/${conversationIdFromPath}`,
      );
      bootstrapSentRef.current = true;
      return;
    }

    bootstrapSentRef.current = true;
    void sendMessage(
      conversationIdFromPath,
      {
        text: t.agents.nameStepBootstrapMessage.replace("{name}", agentName),
        files: [],
      },
      { optimistic: false },
    ).finally(() => {
      history.replaceState(
        null,
        "",
        `/workspace/agents/${agentName}/chats/${conversationIdFromPath}`,
      );
    });
  }, [
    agentName,
    bootstrapRequested,
    conversationIdFromPath,
    sendMessage,
    t.agents.nameStepBootstrapMessage,
    thread.isThreadLoading,
    thread.messages.length,
  ]);

  const handleSubmit = useCallback(
    (message: PromptInputMessage) => {
      return guardSubmit(message, (nextMessage) => {
        void sendMessage(conversationId, nextMessage).catch(() => undefined);
      });
    },
    [conversationId, guardSubmit, sendMessage],
  );

  const handleSaveAgent = useCallback(async () => {
    if (thread.isLoading) {
      return;
    }

    try {
      await sendMessage(
        conversationIdFromPath,
        {
          text: t.agents.saveCommandMessage,
          files: [],
        },
        { optimistic: false },
      );
      toast.success(t.agents.saveRequested);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }, [
    conversationIdFromPath,
    sendMessage,
    t.agents.saveCommandMessage,
    t.agents.saveRequested,
    thread.isLoading,
  ]);

  const handleStop = useCallback(async () => {
    await thread.stop();
  }, [thread]);

  const isNewConversation = conversationId === "new";
  const messageListPaddingBottom = showFollowups
    ? MESSAGE_LIST_DEFAULT_PADDING_BOTTOM +
      MESSAGE_LIST_FOLLOWUPS_EXTRA_PADDING_BOTTOM
    : undefined;

  return (
    <ThreadContext.Provider value={{ thread, isMock: false, apiMode: "bff" }}>
      <ChatBox threadId={conversationId}>
        <div className="relative flex size-full min-h-0 justify-between">
          <header
            className={cn(
              "absolute top-0 right-0 left-0 z-30 flex h-12 shrink-0 items-center gap-2 px-4",
              isNewConversation
                ? "bg-background/0 backdrop-blur-none"
                : "bg-background/80 shadow-xs backdrop-blur",
            )}
          >
            <div className="flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1">
              <BotIcon className="text-primary h-3.5 w-3.5" />
              <span className="text-xs font-medium">
                {agent?.name ?? agentName}
              </span>
            </div>

            <div className="flex w-full items-center text-sm font-medium">
              <ThreadTitle threadId={conversationId} thread={thread} />
            </div>
            <div className="mr-4 flex items-center gap-2">
              <Tooltip content={t.agents.save}>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void handleSaveAgent()}
                  disabled={
                    thread.isLoading ||
                    thread.isThreadLoading ||
                    conversationId === "new"
                  }
                >
                  <SaveIcon /> {t.agents.save}
                </Button>
              </Tooltip>
              <Tooltip content={t.agents.newChat}>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    router.push(`/workspace/agents/${agentName}/chats/new`);
                  }}
                >
                  <PlusSquare /> {t.agents.newChat}
                </Button>
              </Tooltip>
              <TokenUsageIndicator messages={thread.messages} />
              <ExportTrigger threadId={conversationId} />
              <ArtifactTrigger />
            </div>
          </header>

          <main className="flex min-h-0 max-w-full grow flex-col">
            <div className="flex size-full justify-center">
              <MessageList
                className={cn("size-full", !isNewConversation && "pt-10")}
                threadId={conversationId}
                thread={thread}
                paddingBottom={messageListPaddingBottom}
              />
            </div>

            <div className="absolute right-0 bottom-0 left-0 z-30 flex justify-center px-4">
              <div
                className={cn(
                  "relative w-full",
                  isNewConversation && "-translate-y-[calc(50vh-96px)]",
                  isNewConversation
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

                <InputBox
                  className={cn("bg-background/5 w-full -translate-y-4")}
                  isNewThread={isNewConversation}
                  threadId={conversationId}
                  autoFocus={isNewConversation}
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
                    isNewConversation && (
                      <AgentWelcome agent={agent} agentName={agentName} />
                    )
                  }
                  disabled={
                    env.NEXT_PUBLIC_STATIC_WEBSITE_ONLY === "true" ||
                    isUploading
                  }
                  onContextChange={(context) => setSettings("context", context)}
                  onFollowupsVisibilityChange={setShowFollowups}
                  onSubmit={handleSubmit}
                  onStop={handleStop}
                />
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

export default function AgentChatPage() {
  return isAgentsUiEnabled() ? <AgentChatPageEnabled /> : <AgentsDisabledState />;
}
