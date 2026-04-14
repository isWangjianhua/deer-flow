"use client";

import { ShieldCheck } from "lucide-react";

import { AuthPanel } from "@/components/auth/auth-panel";
import { AccountSessionCard } from "@/components/auth/account-session-card";
import { LogoutButton } from "@/components/auth/logout-button";
import { Badge } from "@/components/ui/badge";
import { useBrowserAuthSession } from "@/core/auth/browser";
import { isLocalDevAuthMode } from "@/core/auth/local";
import { toAuthSessionState } from "@/core/auth/session";
import { useI18n } from "@/core/i18n/hooks";

export default function WorkspaceAccountPage() {
  const { t } = useI18n();
  const localMode = isLocalDevAuthMode();
  const sessionState = toAuthSessionState(useBrowserAuthSession());

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
      <section className="rounded-[24px] border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                <ShieldCheck className="mr-1 size-3.5" />
                {localMode ? t.auth.authModeLocal : t.auth.authModeOidc}
              </Badge>
              <Badge
                variant={
                  sessionState.status === "authenticated" ? "default" : "outline"
                }
              >
                {sessionState.status === "authenticated"
                  ? t.auth.signedIn
                  : sessionState.status === "loading"
                    ? t.auth.checking
                    : t.auth.signedOut}
              </Badge>
            </div>

            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight">
                {t.auth.accountTitle}
              </h1>
              <p className="text-muted-foreground max-w-2xl text-sm leading-6 sm:text-base">
                {t.auth.accountDescription}
              </p>
            </div>
          </div>

          {sessionState.status === "authenticated" ? (
            <LogoutButton className="shrink-0" variant="outline" />
          ) : null}
        </div>
      </section>

      <div className="grid gap-4">
        {sessionState.status !== "authenticated" ? (
          <div className="rounded-[24px] border bg-card p-5 shadow-sm sm:p-6">
            <AuthPanel mode="page" />
          </div>
        ) : null}
        <AccountSessionCard />
      </div>
    </div>
  );
}
