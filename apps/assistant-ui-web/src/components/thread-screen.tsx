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

  const threadPane = (
    <div className="flex h-full min-h-0 flex-col">
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

  return (
    <AppShell activeThreadId={conversationId} threads={threads}>
      <section className="flex h-full min-h-0 flex-col bg-background">
        <div className="flex h-14 items-center justify-between border-b border-border px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <SidebarTrigger className="-ml-1" />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold md:text-base">DeerFlow Workspace</div>
              <div className="truncate text-xs text-muted-foreground">assistant-ui shell</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="hidden items-center gap-2 md:flex">
              <span className="text-xs font-medium text-muted-foreground">Model</span>
              <select
                className="h-9 min-w-44 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-ring"
                onChange={(event) => {
                  setSelectedModel(event.target.value);
                }}
                value={selectedModel}
              >
                {models.length === 0 ? (
                  <option value="">Default model</option>
                ) : null}
                {models.map((model) => (
                  <option key={model.name} value={model.name}>
                    {model.display_name || model.name}
                  </option>
                ))}
              </select>
            </label>
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
                  {canvasPane}
                </SheetContent>
              </Sheet>
            </>
          ) : canvasState.open ? (
            <ResizablePanelGroup className="min-h-0 flex-1" direction="horizontal">
              <ResizablePanel defaultSize={64} minSize={45}>
                {threadPane}
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={36} minSize={24}>
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
    </AppShell>
  );
}
