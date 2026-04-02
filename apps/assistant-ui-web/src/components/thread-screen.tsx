"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Share2Icon } from "lucide-react";

import { AuthDialog } from "@/components/auth-dialog";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { getCurrentUser, type CurrentUser } from "@/lib/auth";
import { isUnauthorizedError } from "@/lib/auth-errors";
import {
  loadRuntimeState,
  type DeerFlowRuntimeState,
} from "../lib/runtime/deerflow-runtime";
import { createThreadListRuntime, type ThreadListItem } from "../lib/runtime/thread-list-runtime";

import { AssistantUiThread } from "./assistant-ui-thread";
import { AppShell } from "./app-shell";
import { Button } from "./ui/button";
import { CanvasPanel } from "./workspace/canvas-panel";

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
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [runtimeState, setRuntimeState] = useState<DeerFlowRuntimeState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const authResolverRef = useRef<((authenticated: boolean) => void) | null>(null);

  const ensureAuthenticated = useCallback(async () => {
    if (currentUser) {
      return true;
    }

    const freshUser = await getCurrentUser();
    if (freshUser) {
      setCurrentUser(freshUser);
      return true;
    }

    setAuthDialogOpen(true);
    return await new Promise<boolean>((resolve) => {
      authResolverRef.current = resolve;
    });
  }, [currentUser]);

  const resolveAuthDialog = useCallback((authenticated: boolean) => {
    authResolverRef.current?.(authenticated);
    authResolverRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const user = await getCurrentUser();
        if (cancelled) {
          return;
        }
        setCurrentUser(user);

        if (user) {
          const loadedThreads = await threadListRuntime.load();
          if (cancelled) {
            return;
          }
          setThreads(loadedThreads);
        }

        if (!initialConversationId) {
          setLoading(false);
          return;
        }

        if (!user) {
          setLoading(false);
          return;
        }

        const state = await loadRuntimeState(initialConversationId);
        if (!cancelled) {
          setRuntimeState(state);
        }
      } catch (bootstrapError) {
        if (!cancelled && !isUnauthorizedError(bootstrapError)) {
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

  return (
    <AppShell activeThreadId={conversationId} threads={threads}>
      <section className="flex h-full min-h-0 flex-col bg-background">
        <div className="flex h-14 items-center justify-between border-b border-border px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <SidebarTrigger className="-ml-1" />
            <h1 className="truncate text-sm font-medium md:text-base">
              {runtimeState?.title || "New Thread"}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            {currentUser ? (
              <div className="hidden text-right text-xs text-muted-foreground md:block">
                <div className="font-medium text-foreground">{currentUser.username}</div>
                <div>Connected</div>
              </div>
            ) : null}
            <Button className="size-8" size="icon" variant="ghost">
              <Share2Icon className="size-4" />
            </Button>
          </div>
        </div>

        <ResizablePanelGroup className="min-h-0 flex-1" direction="horizontal">
          <ResizablePanel defaultSize={64} minSize={45}>
            <div className="flex h-full min-h-0 flex-col">
              {loading ? (
                <p className="px-6 py-8 text-sm text-muted-foreground md:px-10">Loading...</p>
              ) : null}
              {error ? <p className="px-6 py-8 text-sm text-red-300 md:px-10">{error}</p> : null}
              {!loading ? (
                <AssistantUiThread
                  ensureAuthenticated={ensureAuthenticated}
                  initialState={runtimeState}
                  onStateChange={(nextState) => {
                    setRuntimeState(nextState);
                    if (
                      nextState.conversationId &&
                      nextState.conversationId !== conversationId
                    ) {
                      setConversationId(nextState.conversationId);
                      router.replace(`/workspace/${nextState.conversationId}`);
                    }
                    void threadListRuntime.load().then(setThreads).catch(() => {});
                  }}
                />
              ) : null}
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={36} minSize={24}>
            <CanvasPanel
              artifacts={runtimeState?.artifacts ?? []}
              title={runtimeState?.title ?? "New Thread"}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
        <AuthDialog
          onOpenChange={(open) => {
            setAuthDialogOpen(open);
            if (!open) {
              resolveAuthDialog(false);
            }
          }}
          onSuccess={() => {
            void getCurrentUser().then((user) => {
              setCurrentUser(user);
            });
            void threadListRuntime.load().then(setThreads).catch(() => {});
            resolveAuthDialog(true);
          }}
          open={authDialogOpen}
        />
      </section>
    </AppShell>
  );
}
