"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileTextIcon, DownloadIcon, LogOutIcon, UserCircleIcon } from "lucide-react";

import { AuthDialog } from "@/components/auth-dialog";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { getCurrentUser, type CurrentUser } from "@/lib/auth";
import { isUnauthorizedError } from "@/lib/auth-errors";
import { listModels, type GatewayModel } from "@/lib/models";
import {
  reconcileCanvasState,
  selectCanvasArtifact,
  type CanvasState,
} from "@/lib/artifacts";
import {
  loadRuntimeState,
  type DeerFlowRuntimeState,
} from "../lib/runtime/deerflow-runtime";
import { createThreadListRuntime, type ThreadListItem } from "../lib/runtime/thread-list-runtime";

import { AssistantUiThread } from "./assistant-ui-thread";
import { AppShell } from "./app-shell";
import { Button } from "./ui/button";
import { CanvasProvider } from "./workspace/canvas-context";
import { CanvasPanel } from "./workspace/canvas-panel";
import { ThreadContextProvider } from "./workspace/thread-context";

type ThreadScreenProps = Readonly<{
  initialConversationId?: string | null;
}>;

export function ThreadScreen({ initialConversationId = null }: ThreadScreenProps) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const threadListRuntime = useMemo(() => createThreadListRuntime(), []);
  const [threads, setThreads] = useState<ThreadListItem[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(
    initialConversationId,
  );
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [models, setModels] = useState<GatewayModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [runtimeState, setRuntimeState] = useState<DeerFlowRuntimeState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [canvasState, setCanvasState] = useState<CanvasState>({
    open: false,
    selectedArtifact: null,
  });
  const authResolverRef = useRef<((authenticated: boolean) => void) | null>(null);
  const artifacts = runtimeState?.artifacts ?? [];

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
        const [user, availableModels] = await Promise.all([
          getCurrentUser(),
          listModels().catch(() => []),
        ]);
        if (cancelled) {
          return;
        }
        setCurrentUser(user);
        setModels(availableModels);
        if (availableModels.length > 0) {
          setSelectedModel((current) => current || availableModels[0]?.name || "");
        }

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

  useEffect(() => {
    setCanvasState((current) => {
      const next = reconcileCanvasState(artifacts, current);
      return next.open === current.open && next.selectedArtifact === current.selectedArtifact
        ? current
        : next;
    });
  }, [artifacts]);

  const openCanvas = useCallback(() => {
    if (artifacts.length === 0) {
      return;
    }

    setCanvasState((current) => ({
      open: true,
      selectedArtifact: selectCanvasArtifact(artifacts, current.selectedArtifact),
    }));
  }, [artifacts]);

  const closeCanvas = useCallback(() => {
    setCanvasState((current) => ({
      ...current,
      open: false,
    }));
  }, []);

  const selectCanvasArtifactByPath = useCallback((artifactPath: string) => {
    setCanvasState((current) => ({
      ...current,
      selectedArtifact: artifactPath,
    }));
  }, []);

  const openArtifactInCanvas = useCallback((artifactPath: string) => {
    setCanvasState({
      open: true,
      selectedArtifact: artifactPath,
    });
  }, []);

  const canvasControls = useMemo(
    () => ({
      canOpenCanvas: artifacts.length > 0,
      hasArtifact: (artifactPath: string) => artifacts.includes(artifactPath),
      isCanvasOpen: canvasState.open,
      openCanvas,
      closeCanvas,
      openArtifact: openArtifactInCanvas,
      selectArtifact: selectCanvasArtifactByPath,
    }),
    [
      artifacts,
      canvasState.open,
      closeCanvas,
      openArtifactInCanvas,
      openCanvas,
      selectCanvasArtifactByPath,
    ],
  );

  const handleExportMarkdown = useCallback(() => {
    if (!runtimeState) return;
    const lines: string[] = [];
    if (runtimeState.title) lines.push(`# ${runtimeState.title}\n`);
    for (const msg of runtimeState.messages) {
      const role = (msg as { role?: string }).role ?? "unknown";
      const content = (msg as { content?: unknown }).content;
      let text = "";
      if (typeof content === "string") {
        text = content;
      } else if (Array.isArray(content)) {
        text = (content as { text?: string }[]).map((c) => c.text ?? "").join("");
      }
      if (text.trim()) {
        lines.push(`**${role === "user" ? "用户" : "助手"}**: ${text.trim()}\n`);
      }
    }
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${runtimeState.title || "conversation"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [runtimeState]);

  const handleExportJson = useCallback(() => {
    if (!runtimeState) return;
    const blob = new Blob([JSON.stringify(runtimeState, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${runtimeState.title || "conversation"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [runtimeState]);

  const threadPane = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 h-14 items-center justify-between px-4 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold md:text-base">{runtimeState?.title || "DeerFlow 2.0 问候"}</div>
          </div>
        </div>

        <div className="flex items-center gap-1 md:gap-3">
          <div className="group relative">
            <Button className="h-8 gap-2 text-muted-foreground hover:text-foreground" variant="ghost">
              <DownloadIcon className="size-4" />
              <span className="hidden md:inline">导出</span>
            </Button>
            <div className="invisible absolute right-0 top-full pt-1 opacity-0 transition-all group-hover:visible group-hover:opacity-100 z-50">
              <div className="w-40 rounded-md border border-border/60 bg-popover p-1 shadow-md">
              <button
                  className="flex w-full items-center px-2 py-1.5 text-sm hover:bg-muted rounded-sm"
                  onClick={handleExportMarkdown}
                >
                  导出为 Markdown
                </button>
                <button
                  className="flex w-full items-center px-2 py-1.5 text-sm hover:bg-muted rounded-sm"
                  onClick={handleExportJson}
                >
                  导出为 JSON
                </button>
              </div>
            </div>
          </div>

          <Button className="h-8 gap-2 text-muted-foreground hover:text-foreground" variant="ghost" onClick={openCanvas}>
            <FileTextIcon className="size-4" />
            <span className="hidden md:inline">文件</span>
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 relative flex flex-col">
        {loading ? (
          <p className="px-6 py-8 text-sm text-muted-foreground md:px-10">Loading...</p>
        ) : null}
        {error ? <p className="px-6 py-8 text-sm text-red-300 md:px-10">{error}</p> : null}
        {!loading ? (
          <AssistantUiThread
            ensureAuthenticated={ensureAuthenticated}
            initialState={runtimeState}
            modelName={selectedModel || undefined}
            onStateChange={(nextState) => {
              setRuntimeState(nextState);
              if (nextState.conversationId && nextState.conversationId !== conversationId) {
                setConversationId(nextState.conversationId);
                router.replace(`/workspace/${nextState.conversationId}`);
              }
              void threadListRuntime.load().then(setThreads).catch(() => {});
            }}
          />
        ) : null}
      </div>
    </div>
  );

  const canvasPane = (
    <CanvasPanel
      artifacts={artifacts}
      conversationId={conversationId}
      onClose={closeCanvas}
      onSelectArtifact={selectCanvasArtifactByPath}
      selectedArtifact={canvasState.selectedArtifact}
      title={runtimeState?.title ?? "New Thread"}
    />
  );

  const threadContextValue = useMemo(
    () => ({ models, selectedModel, setSelectedModel, runtimeState }),
    [models, selectedModel, runtimeState],
  );

  return (
    <AppShell activeThreadId={conversationId} threads={threads} currentUser={currentUser}>
      <ThreadContextProvider value={threadContextValue}>
      <section className="flex h-full min-h-0 flex-col bg-background">

        <CanvasProvider value={canvasControls}>
          {isMobile ? (
            <>
              <div className="min-h-0 flex-1">{threadPane}</div>
              <Sheet
                onOpenChange={(open) => {
                  if (open) {
                    openCanvas();
                  } else {
                    closeCanvas();
                  }
                }}
                open={canvasState.open}
              >
                <SheetContent className="w-[92vw] p-0 sm:max-w-xl" side="right">
                  <SheetHeader className="sr-only">
                    <SheetTitle>Canvas</SheetTitle>
                    <SheetDescription>
                      Preview generated files without leaving the conversation.
                    </SheetDescription>
                  </SheetHeader>
                  <div className="h-full bg-background border-l border-border">{canvasPane}</div>
                </SheetContent>
              </Sheet>
            </>
          ) : canvasState.open ? (
            <ResizablePanelGroup className="min-h-0 flex-1" direction="horizontal">
              <ResizablePanel defaultSize={50} minSize={25}>
                {threadPane}
              </ResizablePanel>
              <ResizableHandle className="w-1.5 opacity-50 hover:bg-muted transition-colors" />
              <ResizablePanel defaultSize={50} minSize={25}>
                {canvasPane}
              </ResizablePanel>
            </ResizablePanelGroup>
          ) : (
            <div className="min-h-0 flex-1">{threadPane}</div>
          )}
        </CanvasProvider>
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
      </ThreadContextProvider>
    </AppShell>
  );
}
