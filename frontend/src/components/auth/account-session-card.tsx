"use client";

import { ChevronDown, CircleAlert, Server, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { loadBffUser, type BffUserResponse } from "@/core/auth/bff-user";
import { useBrowserAuthSession } from "@/core/auth/browser";
import { isLocalDevAuthMode } from "@/core/auth/local";
import { toAuthSessionState } from "@/core/auth/session";
import { useI18n } from "@/core/i18n/hooks";
import { cn } from "@/lib/utils";

import { LogoutButton } from "./logout-button";

type StatusTone = "success" | "neutral" | "error";

function toneToVariant(
  tone: StatusTone,
): "default" | "secondary" | "destructive" | "outline" {
  switch (tone) {
    case "success":
      return "default";
    case "error":
      return "destructive";
    case "neutral":
      return "secondary";
    default:
      return "outline";
  }
}

function StatusBadge({ label, tone }: { label: string; tone: StatusTone }) {
  return <Badge variant={toneToVariant(tone)}>{label}</Badge>;
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="max-w-[65%] text-right font-medium break-words">
        {value}
      </dd>
    </div>
  );
}

function StatusSection({
  title,
  description,
  badge,
  children,
}: {
  title: string;
  description: string;
  badge: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-muted-foreground text-sm">{description}</p>
        </div>
        {badge}
      </div>
      <Separator className="my-4" />
      <dl className="space-y-3">{children}</dl>
    </section>
  );
}

export function AccountSessionCard() {
  const { t } = useI18n();
  const session = useBrowserAuthSession();
  const state = toAuthSessionState(session);
  const [bffUser, setBffUser] = useState<BffUserResponse | null>(null);
  const [bffError, setBffError] = useState<string | null>(null);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const localMode = isLocalDevAuthMode();

  useEffect(() => {
    if (state.status !== "authenticated") {
      setBffUser(null);
      setBffError(null);
      return;
    }

    let cancelled = false;
    void loadBffUser()
      .then((payload) => {
        if (!cancelled) {
          setBffUser(payload);
          setBffError(null);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setBffUser(null);
          setBffError(
            error instanceof Error ? error.message : t.auth.bffLoadFailed,
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [state.status, t.auth.bffLoadFailed]);

  const browserStatus =
    state.status === "authenticated"
      ? { label: t.auth.signedIn, tone: "success" as const }
      : state.status === "loading"
        ? { label: t.auth.checking, tone: "neutral" as const }
        : { label: t.auth.signedOut, tone: "neutral" as const };

  const bffStatus =
    state.status === "authenticated"
      ? bffError
        ? { label: t.auth.needsAttention, tone: "error" as const }
        : bffUser
          ? { label: t.auth.connected, tone: "success" as const }
          : { label: t.auth.checking, tone: "neutral" as const }
      : { label: t.auth.waitingForSignIn, tone: "neutral" as const };

  const browserSummary =
    state.status === "authenticated"
      ? t.auth.browserSummaryAuthenticated
      : state.status === "loading"
        ? t.auth.browserSummaryLoading
        : t.auth.browserSummarySignedOut;

  const bffSummary =
    state.status !== "authenticated"
      ? t.auth.bffSummarySignedOut
      : (bffError ??
        (bffUser ? t.auth.bffSummaryConnected : t.auth.bffSummaryLoading));

  const browserDiagnostics = {
    status: state.status,
    user: state.user,
    errorMessage: state.errorMessage,
  };
  const bffDiagnostics = {
    user: bffUser,
    error: bffError,
  };

  return (
    <Card className="gap-4">
      <CardHeader>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              label={localMode ? t.auth.authModeLocal : t.auth.authModeOidc}
              tone="neutral"
            />
            <StatusBadge
              label={browserStatus.label}
              tone={browserStatus.tone}
            />
          </div>
          <div className="space-y-1">
            <CardTitle>{t.auth.sessionTitle}</CardTitle>
            <CardDescription>{t.auth.sessionDescription}</CardDescription>
          </div>
        </div>
        <CardAction className="hidden sm:block">
          {state.status === "authenticated" ? <LogoutButton /> : null}
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        {state.errorMessage ? (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>{t.auth.browserSessionIssue}</AlertTitle>
            <AlertDescription>{state.errorMessage}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-4">
          <StatusSection
            title={t.auth.browserSession}
            description={browserSummary}
            badge={
              <StatusBadge
                label={browserStatus.label}
                tone={browserStatus.tone}
              />
            }
          >
            <DetailRow
              label={t.auth.signInMode}
              value={localMode ? t.auth.authModeLocal : t.auth.authModeOidc}
            />
            <DetailRow label={t.auth.userId} value={state.user?.id ?? "-"} />
            <DetailRow label={t.auth.email} value={state.user?.email ?? "-"} />
            <DetailRow label={t.auth.name} value={state.user?.name ?? "-"} />
          </StatusSection>

          <StatusSection
            title={t.auth.bffConnection}
            description={bffSummary}
            badge={
              <StatusBadge label={bffStatus.label} tone={bffStatus.tone} />
            }
          >
            <DetailRow label={t.auth.bridgeEndpoint} value="/api/bff/me" />
            <DetailRow label={t.auth.bffUserId} value={bffUser?.id ?? "-"} />
            <DetailRow
              label={t.auth.bffUsername}
              value={bffUser?.username ?? "-"}
            />
            <DetailRow label={t.auth.bffEmail} value={bffUser?.email ?? "-"} />
          </StatusSection>
        </div>

        {state.status === "authenticated" ? (
          <div className="flex flex-wrap items-center gap-3 sm:hidden">
            <LogoutButton />
          </div>
        ) : null}

        <Collapsible open={diagnosticsOpen} onOpenChange={setDiagnosticsOpen}>
          <div className="rounded-xl border p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">
                  {t.auth.diagnosticsTitle}
                </h3>
                <p className="text-muted-foreground text-sm">
                  {t.auth.diagnosticsDescription}
                </p>
              </div>
              <CollapsibleTrigger className="text-muted-foreground inline-flex items-center gap-2 text-sm font-medium">
                {diagnosticsOpen ? t.auth.hideDetails : t.auth.showDetails}
                <ChevronDown
                  className={cn(
                    "size-4 transition-transform",
                    diagnosticsOpen ? "rotate-180" : "rotate-0",
                  )}
                />
              </CollapsibleTrigger>
            </div>

            <CollapsibleContent className="pt-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <UserRound className="size-4" />
                    {t.auth.browserPayload}
                  </div>
                  <pre className="bg-muted overflow-x-auto rounded-md p-3 text-xs">
                    {JSON.stringify(browserDiagnostics, null, 2)}
                  </pre>
                </div>
                <div className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Server className="size-4" />
                    {t.auth.bffPayload}
                  </div>
                  <pre className="bg-muted overflow-x-auto rounded-md p-3 text-xs">
                    {JSON.stringify(bffDiagnostics, null, 2)}
                  </pre>
                </div>
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
