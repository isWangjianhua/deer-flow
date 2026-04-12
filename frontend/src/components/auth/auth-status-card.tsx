"use client";

import { ChevronDown, CircleAlert, Server, UserRound } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { loadBffUser, type BffUserResponse } from "@/core/auth/bff-user";
import {
  signInWithLocalPassword,
  useBrowserAuthSession,
} from "@/core/auth/browser";
import { isLocalDevAuthMode } from "@/core/auth/local";
import { toAuthSessionState } from "@/core/auth/session";
import { cn } from "@/lib/utils";

import { LoginButton } from "./login-button";
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

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="max-w-[65%] break-words text-right font-medium">{value}</dd>
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

export function AuthStatusCard() {
  const session = useBrowserAuthSession();
  const state = toAuthSessionState(session);
  const [bffUser, setBffUser] = useState<BffUserResponse | null>(null);
  const [bffError, setBffError] = useState<string | null>(null);
  const [username, setUsername] = useState("demo");
  const [password, setPassword] = useState("demo123");
  const [localLoginError, setLocalLoginError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
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
            error instanceof Error ? error.message : "Failed to load BFF user",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [state.status]);

  async function handleLocalLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setLocalLoginError(null);

    try {
      await signInWithLocalPassword(username, password);
      window.location.reload();
    } catch (error) {
      setLocalLoginError(
        error instanceof Error ? error.message : "Failed to sign in",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const browserStatus =
    state.status === "authenticated"
      ? { label: "Signed in", tone: "success" as const }
      : state.status === "loading"
        ? { label: "Checking", tone: "neutral" as const }
        : { label: "Signed out", tone: "neutral" as const };

  const bffStatus =
    state.status === "authenticated"
      ? bffError
        ? { label: "Needs attention", tone: "error" as const }
        : bffUser
          ? { label: "Connected", tone: "success" as const }
          : { label: "Checking", tone: "neutral" as const }
      : { label: "Waiting for sign-in", tone: "neutral" as const };

  const browserSummary =
    state.status === "authenticated"
      ? "Your browser session is active and ready to call the BFF."
      : state.status === "loading"
        ? "Checking whether an existing browser session can be restored."
        : "Sign in to unlock authenticated workspace actions.";

  const bffSummary =
    state.status !== "authenticated"
      ? "The BFF health check runs after you sign in."
      : bffError ??
        (bffUser
          ? "The BFF /me bridge responded successfully."
          : "Loading the authenticated BFF profile now.");

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
    <Card className="max-w-4xl gap-4">
      <CardHeader>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              label={localMode ? "Local BFF auth" : "Browser OIDC"}
              tone="neutral"
            />
            <StatusBadge label={browserStatus.label} tone={browserStatus.tone} />
          </div>
          <div className="space-y-1">
            <CardTitle>Session and access</CardTitle>
            <CardDescription>
              Review your browser sign-in state, verify the authenticated BFF
              connection, and open raw diagnostics only when you need them.
            </CardDescription>
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
            <AlertTitle>Browser session issue</AlertTitle>
            <AlertDescription>{state.errorMessage}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2">
          <StatusSection
            title="Browser session"
            description={browserSummary}
            badge={
              <StatusBadge
                label={browserStatus.label}
                tone={browserStatus.tone}
              />
            }
          >
            <DetailRow
              label="Sign-in mode"
              value={localMode ? "Local BFF auth" : "OIDC browser session"}
            />
            <DetailRow label="User ID" value={state.user?.id ?? "-"} />
            <DetailRow label="Email" value={state.user?.email ?? "-"} />
            <DetailRow label="Name" value={state.user?.name ?? "-"} />
          </StatusSection>

          <StatusSection
            title="BFF connection"
            description={bffSummary}
            badge={<StatusBadge label={bffStatus.label} tone={bffStatus.tone} />}
          >
            <DetailRow label="Bridge endpoint" value="/api/bff/me" />
            <DetailRow label="BFF user ID" value={bffUser?.id ?? "-"} />
            <DetailRow label="BFF username" value={bffUser?.username ?? "-"} />
            <DetailRow label="BFF email" value={bffUser?.email ?? "-"} />
          </StatusSection>
        </div>

        <section className="rounded-xl border p-4">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">Access actions</h3>
            <p className="text-muted-foreground text-sm">
              Use the same auth mode configured for this environment. Local
              development can sign in with the seeded BFF user.
            </p>
          </div>
          <Separator className="my-4" />

          {state.status === "unauthenticated" && localMode ? (
            <form className="space-y-3" onSubmit={handleLocalLogin}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  autoComplete="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="demo"
                />
                <Input
                  autoComplete="current-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="demo123"
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button disabled={isSubmitting} type="submit">
                  {isSubmitting ? "Signing in..." : "Sign in with local BFF auth"}
                </Button>
                <span className="text-muted-foreground text-sm">
                  Default dev credentials: <code>demo</code> / <code>demo123</code>
                </span>
              </div>
              {localLoginError ? (
                <Alert variant="destructive">
                  <CircleAlert />
                  <AlertTitle>Local sign-in failed</AlertTitle>
                  <AlertDescription>{localLoginError}</AlertDescription>
                </Alert>
              ) : null}
            </form>
          ) : null}

          {state.status === "unauthenticated" && !localMode ? (
            <div className="flex flex-wrap items-center gap-3">
              <LoginButton />
              <span className="text-muted-foreground text-sm">
                You will be redirected to the configured identity provider.
              </span>
            </div>
          ) : null}

          {state.status === "authenticated" ? (
            <div className="flex flex-wrap items-center gap-3 sm:hidden">
              <LogoutButton />
            </div>
          ) : null}
        </section>

        <Collapsible open={diagnosticsOpen} onOpenChange={setDiagnosticsOpen}>
          <div className="rounded-xl border p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">Diagnostics</h3>
                <p className="text-muted-foreground text-sm">
                  Raw session and BFF payloads stay collapsed by default so the
                  page stays useful outside of debugging.
                </p>
              </div>
              <CollapsibleTrigger className="text-muted-foreground inline-flex items-center gap-2 text-sm font-medium">
                {diagnosticsOpen ? "Hide details" : "Show details"}
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
                    Browser session payload
                  </div>
                  <pre className="bg-muted overflow-x-auto rounded-md p-3 text-xs">
                    {JSON.stringify(browserDiagnostics, null, 2)}
                  </pre>
                </div>
                <div className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Server className="size-4" />
                    BFF /me payload
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
