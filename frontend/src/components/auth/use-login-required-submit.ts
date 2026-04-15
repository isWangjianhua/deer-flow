"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import { useBrowserAuthSession } from "@/core/auth/browser";
import {
  consumePendingChatDraft,
  persistPendingChatDraft,
} from "@/core/auth/pending-chat-draft";
import { toAuthSessionState } from "@/core/auth/session";

export function useLoginRequiredSubmit() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const session = useBrowserAuthSession();
  const authState = toAuthSessionState(session);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<PromptInputMessage | null>(
    null,
  );
  const [restoredText, setRestoredText] = useState<string | null>(null);

  const callbackURL = useMemo(() => {
    const search = searchParams.toString();
    return search ? `${pathname}?${search}` : pathname;
  }, [pathname, searchParams]);

  useEffect(() => {
    const restored = consumePendingChatDraft(callbackURL);
    if (restored) {
      setRestoredText(restored);
    }
  }, [callbackURL]);

  const guardSubmit = useCallback(
    (
      message: PromptInputMessage,
      submit: (message: PromptInputMessage) => void | Promise<void>,
    ) => {
      if (authState.status !== "authenticated") {
        setPendingDraft(message);
        setDialogOpen(true);
        return false;
      }

      return submit(message);
    },
    [authState.status],
  );

  const handleAuthenticated = useCallback(() => {
    setDialogOpen(false);
    setPendingDraft(null);
  }, []);

  const handleBeforeOidcRedirect = useCallback(() => {
    if (!pendingDraft?.text.trim()) {
      return;
    }

    persistPendingChatDraft({
      path: callbackURL,
      text: pendingDraft.text,
    });
  }, [callbackURL, pendingDraft]);

  const handleRestoredTextApplied = useCallback(() => {
    setRestoredText(null);
  }, []);

  return {
    dialogOpen,
    setDialogOpen,
    callbackURL,
    restoredText,
    handleRestoredTextApplied,
    handleAuthenticated,
    handleBeforeOidcRedirect,
    guardSubmit,
  };
}
