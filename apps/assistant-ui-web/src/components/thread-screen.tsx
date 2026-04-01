"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

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
  const [runtimeState, setRuntimeState] = useState<DeerFlowRuntimeState | null>(null);
  const [loading, setLoading] = useState(true);
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

  return (
    <AppShell activeThreadId={conversationId} threads={threads}>
      <section>
        <h1>{runtimeState?.title || "Assistant UI"}</h1>
        {loading ? <p>Loading...</p> : null}
        {error ? <p>{error}</p> : null}
        {!loading ? (
          <AssistantUiThread
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
      </section>
    </AppShell>
  );
}
