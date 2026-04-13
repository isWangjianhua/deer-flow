"use client";

import { ShieldCheck } from "lucide-react";

import { AuthPanel } from "@/components/auth/auth-panel";
import { AccountSessionCard } from "@/components/auth/account-session-card";
import { Badge } from "@/components/ui/badge";
import { isLocalDevAuthMode } from "@/core/auth/local";
import { useI18n } from "@/core/i18n/hooks";

export default function WorkspaceAccountPage() {
  const { t } = useI18n();
  const localMode = isLocalDevAuthMode();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <section className="relative overflow-hidden rounded-[28px] border bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.16),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.14),transparent_30%)] p-6">
        <div className="absolute inset-y-0 right-0 hidden w-56 bg-[linear-gradient(135deg,transparent,rgba(15,23,42,0.06))] lg:block" />
        <div className="relative flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">
              <ShieldCheck className="mr-1 size-3.5" />
              {localMode ? t.auth.authModeLocal : t.auth.authModeOidc}
            </Badge>
          </div>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)] lg:items-end">
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight">
                {t.auth.accountTitle}
              </h1>
              <p className="text-muted-foreground max-w-2xl text-sm leading-6 sm:text-base">
                {t.auth.accountDescription}
              </p>
            </div>
            <div className="bg-background/80 grid gap-3 rounded-2xl border p-4 shadow-sm backdrop-blur">
              <div>
                <p className="text-sm font-semibold">{t.auth.accessTitle}</p>
                <p className="text-muted-foreground text-sm">
                  {localMode
                    ? t.auth.accessDescriptionLocal
                    : t.auth.accessDescriptionOidc}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)]">
        <div className="bg-card/80 rounded-[28px] border p-5 shadow-sm backdrop-blur sm:p-6">
          <AuthPanel mode="page" />
        </div>
        <div className="min-w-0">
          <AccountSessionCard />
        </div>
      </div>
    </div>
  );
}
