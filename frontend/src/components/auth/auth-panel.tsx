"use client";

import { CircleAlert } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  signInWithLocalPassword,
  signInWithOidc,
  signUpWithLocalPassword,
  useBrowserAuthSession,
} from "@/core/auth/browser";
import { isLocalDevAuthMode } from "@/core/auth/local";
import { toAuthSessionState } from "@/core/auth/session";
import { useI18n } from "@/core/i18n/hooks";

export function AuthPanel({
  mode = "page",
  defaultTab = "login",
  onSuccess,
  callbackURL = "/workspace/account",
  onBeforeOidcRedirect,
}: {
  mode?: "page" | "dialog";
  defaultTab?: "login" | "register";
  onSuccess?: () => void;
  callbackURL?: string;
  onBeforeOidcRedirect?: () => void;
}) {
  const { t } = useI18n();
  const session = useBrowserAuthSession();
  const sessionState = toAuthSessionState(session);
  const localMode = isLocalDevAuthMode();
  const [authMode, setAuthMode] = useState<"login" | "register">(defaultTab);
  const [username, setUsername] = useState("demo");
  const [password, setPassword] = useState("demo123");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localAuthError, setLocalAuthError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const authModeLabel = localMode ? t.auth.authModeLocal : t.auth.authModeOidc;

  async function finishAuth() {
    if (onSuccess) {
      onSuccess();
      return;
    }
    window.location.reload();
  }

  async function handleLocalAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setLocalAuthError(null);

    try {
      if (!username.trim() || !password) {
        setLocalAuthError(t.auth.usernamePasswordRequired);
        return;
      }

      if (authMode === "register") {
        if (!confirmPassword) {
          setLocalAuthError(t.auth.confirmPasswordRequired);
          return;
        }
        if (password !== confirmPassword) {
          setLocalAuthError(t.auth.passwordsDoNotMatch);
          return;
        }

        await signUpWithLocalPassword(username, password);
      } else {
        await signInWithLocalPassword(username, password);
      }

      await finishAuth();
    } catch (error) {
      setLocalAuthError(
        error instanceof Error
          ? error.message
          : authMode === "register"
            ? t.auth.registerFailedTitle
            : t.auth.signInFailedTitle,
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleOidcSignIn() {
    setLocalAuthError(null);
    try {
      onBeforeOidcRedirect?.();
      await signInWithOidc(callbackURL);
    } catch (error) {
      setLocalAuthError(
        error instanceof Error ? error.message : t.auth.signInFailedTitle,
      );
    }
  }

  return (
    <section
      className={mode === "dialog" ? "space-y-4" : "rounded-xl border p-4"}
    >
      <div className="space-y-1">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">{t.auth.accessTitle}</h3>
          <p className="text-muted-foreground text-sm">
            {localMode
              ? t.auth.accessDescriptionLocal
              : t.auth.accessDescriptionOidc}
          </p>
        </div>
      </div>
      {mode === "page" ? <Separator className="my-4" /> : null}

      {mode === "page" && sessionState.status === "authenticated" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{authModeLabel}</Badge>
            <Badge>{t.auth.signedIn}</Badge>
          </div>
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <div className="space-y-1">
              <h4 className="text-sm font-semibold">
                {t.auth.signedInReadyTitle}
              </h4>
              <p className="text-muted-foreground text-sm">
                {t.auth.signedInReadyDescription}
              </p>
            </div>
            <Separator className="my-4" />
            <dl className="space-y-2 text-sm">
              <div className="flex items-start justify-between gap-4">
                <dt className="text-muted-foreground">{t.auth.signedInAs}</dt>
                <dd className="max-w-[65%] text-right font-medium break-words">
                  {sessionState.user?.email ??
                    sessionState.user?.name ??
                    sessionState.user?.id ??
                    "-"}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-muted-foreground">{t.auth.signInMode}</dt>
                <dd className="max-w-[65%] text-right font-medium break-words">
                  {authModeLabel}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      ) : localMode ? (
        <form className="space-y-3" onSubmit={handleLocalAuthSubmit}>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={authMode === "login" ? "default" : "outline"}
              onClick={() => {
                setAuthMode("login");
                setLocalAuthError(null);
              }}
            >
              {t.auth.login}
            </Button>
            <Button
              type="button"
              variant={authMode === "register" ? "default" : "outline"}
              onClick={() => {
                setAuthMode("register");
                setLocalAuthError(null);
              }}
            >
              {t.auth.register}
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              autoComplete="username"
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder={authMode === "register" ? "new-user" : "demo"}
            />
            <Input
              autoComplete={
                authMode === "register" ? "new-password" : "current-password"
              }
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={authMode === "register" ? "secret123" : "demo123"}
            />
            {authMode === "register" ? (
              <Input
                autoComplete="new-password"
                type="password"
                required
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder={t.auth.confirmPasswordRequired}
              />
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={isSubmitting} type="submit">
              {isSubmitting
                ? authMode === "register"
                  ? t.auth.creatingAccount
                  : t.auth.signingIn
                : authMode === "register"
                  ? t.auth.createLocalAccount
                  : t.auth.signInWithLocal}
            </Button>
            {authMode === "login" ? (
              <span className="text-muted-foreground text-sm">
                {t.auth.defaultCredentials} <code>demo</code> /{" "}
                <code>demo123</code>
              </span>
            ) : (
              <span className="text-muted-foreground text-sm">
                {t.auth.registrationLocalOnly}
              </span>
            )}
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void handleOidcSignIn()}>
            {t.auth.signIn}
          </Button>
          <span className="text-muted-foreground text-sm">
            {t.auth.oidcRedirectHint}
          </span>
        </div>
      )}

      {localAuthError ? (
        <Alert className="mt-3" variant="destructive">
          <CircleAlert />
          <AlertTitle>
            {localMode && authMode === "register"
              ? t.auth.registerFailedTitle
              : t.auth.signInFailedTitle}
          </AlertTitle>
          <AlertDescription>{localAuthError}</AlertDescription>
        </Alert>
      ) : null}
    </section>
  );
}
