"use client";

import { CircleAlert } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const [password, setPassword] = useState("demo1234");
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
    <section className={mode === "dialog" ? "space-y-4" : "space-y-5"}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{authModeLabel}</Badge>
          {mode === "page" && sessionState.status === "authenticated" ? (
            <Badge>{t.auth.signedIn}</Badge>
          ) : null}
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-semibold">{t.auth.accessTitle}</h3>
          <p className="text-muted-foreground text-sm leading-6">
            {localMode
              ? t.auth.accessDescriptionLocal
              : t.auth.accessDescriptionOidc}
          </p>
        </div>
      </div>

      {mode === "page" && sessionState.status === "authenticated" ? (
        <div className="rounded-2xl border p-4">
          <div className="space-y-1">
            <h4 className="text-sm font-semibold">{t.auth.signedInReadyTitle}</h4>
            <p className="text-muted-foreground text-sm leading-6">
              {t.auth.signedInReadyDescription}
            </p>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{authModeLabel}</Badge>
            <Badge>{t.auth.signedIn}</Badge>
          </div>
        </div>
      ) : localMode ? (
        <form className="space-y-4" onSubmit={handleLocalAuthSubmit}>
          <div className="rounded-xl bg-muted p-1">
            <div className="grid grid-cols-2 gap-1">
              <Button
                type="button"
                variant={authMode === "login" ? "default" : "ghost"}
                className="h-9 rounded-lg"
                onClick={() => {
                  setAuthMode("login");
                  setLocalAuthError(null);
                }}
              >
                {t.auth.login}
              </Button>
              <Button
                type="button"
                variant={authMode === "register" ? "default" : "ghost"}
                className="h-9 rounded-lg"
                onClick={() => {
                  setAuthMode("register");
                  setLocalAuthError(null);
                }}
              >
                {t.auth.register}
              </Button>
            </div>
          </div>

          <div className="grid gap-3">
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
              placeholder={authMode === "register" ? "secret123" : "demo1234"}
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

          <div
            className={`flex gap-3 ${
              mode === "dialog"
                ? "flex-col"
                : "sm:flex-row sm:items-center sm:justify-between"
            }`}
          >
            <Button
              className={mode === "dialog" ? "w-full" : "sm:min-w-44"}
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting
                ? authMode === "register"
                  ? t.auth.creatingAccount
                  : t.auth.signingIn
                : authMode === "register"
                  ? t.auth.createLocalAccount
                  : t.auth.signInWithLocal}
            </Button>
            <p className="text-muted-foreground mt-3 text-sm leading-6">
              {authMode === "login" ? (
                <>
                  {t.auth.defaultCredentials} <code>demo</code> /{" "}
                  <code>demo1234</code>
                </>
              ) : (
                t.auth.registrationLocalOnly
              )}
            </p>
          </div>
        </form>
      ) : (
        <div className="rounded-2xl border p-4">
          <div className="flex flex-col gap-3">
            <Button
              className={mode === "dialog" ? "w-full" : "sm:w-fit"}
              onClick={() => void handleOidcSignIn()}
            >
              {t.auth.signIn}
            </Button>
            <p className="text-muted-foreground text-sm leading-6">
              {t.auth.oidcRedirectHint}
            </p>
          </div>
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
