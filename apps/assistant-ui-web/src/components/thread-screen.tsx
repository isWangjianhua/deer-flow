"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AuthDialog } from "@/components/auth-dialog";
import { getCurrentUser, type CurrentUser } from "@/lib/auth";
import { isUnauthorizedError } from "@/lib/auth-errors";
import {
  loadRuntimeState,
  type DeerFlowRuntimeState,
} from "../lib/runtime/deerflow-runtime";
import { createThreadListRuntime, type ThreadListItem } from "../lib/runtime/thread-list-runtime";

import { AssistantUiThread } from "./assistant-ui-thread";
import { AppShell } from "./app-shell";

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
      <section className="flex min-h-screen flex-col">
        <div className="border-b border-white/8 px-6 py-6 md:px-10">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/35">
            Workspace
          </p>
          <h1 className="mt-3 font-[family-name:var(--font-serif)] text-3xl text-white md:text-4xl">
            {runtimeState?.title || "Assistant UI"}
          </h1>
        </div>

        {loading ? <p className="px-6 py-8 text-sm text-white/55 md:px-10">Loading...</p> : null}
        {error ? <p className="px-6 py-8 text-sm text-red-300 md:px-10">{error}</p> : null}
        {!loading ? (
          <AssistantUiThread
            ensureAuthenticated={ensureAuthenticated}
            initialState={runtimeState}
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
