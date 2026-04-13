"use client";

import { CircleAlert, Languages } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { signInWithLocalPassword, signInWithOidc, signUpWithLocalPassword } from "@/core/auth/browser";
import { isLocalDevAuthMode } from "@/core/auth/local";
import { enUS, isLocale, zhCN, type Locale } from "@/core/i18n";
import { useI18n } from "@/core/i18n/hooks";

const languageOptions: { value: Locale; label: string }[] = [
  { value: "en-US", label: enUS.locale.localName },
  { value: "zh-CN", label: zhCN.locale.localName },
];

export function AuthPanel({
  mode = "page",
  defaultTab = "login",
  onSuccess,
}: {
  mode?: "page" | "dialog";
  defaultTab?: "login" | "register";
  onSuccess?: () => void;
}) {
  const { locale, changeLocale } = useI18n();
  const localMode = isLocalDevAuthMode();
  const [authMode, setAuthMode] = useState<"login" | "register">(defaultTab);
  const [username, setUsername] = useState("demo");
  const [password, setPassword] = useState("demo123");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localAuthError, setLocalAuthError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
        setLocalAuthError("Username and password are required");
        return;
      }

      if (authMode === "register") {
        if (!confirmPassword) {
          setLocalAuthError("Please confirm your password");
          return;
        }
        if (password !== confirmPassword) {
          setLocalAuthError("Passwords do not match");
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
            ? "Failed to register"
            : "Failed to sign in",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleOidcSignIn() {
    setLocalAuthError(null);
    try {
      await signInWithOidc();
    } catch (error) {
      setLocalAuthError(error instanceof Error ? error.message : "Failed to sign in");
    }
  }

  return (
    <section className={mode === "dialog" ? "space-y-4" : "rounded-xl border p-4"}>
      <div className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">Access actions</h3>
            <p className="text-muted-foreground text-sm">
              {localMode
                ? "Use local sign-in or create a local account for multi-user testing."
                : "Sign in with the configured identity provider to unlock the workspace."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Languages className="text-muted-foreground size-4" />
            <Select
              value={locale}
              onValueChange={(value) => {
                if (isLocale(value)) {
                  changeLocale(value);
                }
              }}
            >
              <SelectTrigger className="w-[116px]" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {languageOptions.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      {mode === "page" ? <Separator className="my-4" /> : null}

      {localMode ? (
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
              Login
            </Button>
            <Button
              type="button"
              variant={authMode === "register" ? "default" : "outline"}
              onClick={() => {
                setAuthMode("register");
                setLocalAuthError(null);
              }}
            >
              Register
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
              autoComplete={authMode === "register" ? "new-password" : "current-password"}
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
                placeholder="Confirm password"
              />
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={isSubmitting} type="submit">
              {isSubmitting
                ? authMode === "register"
                  ? "Creating account..."
                  : "Signing in..."
                : authMode === "register"
                  ? "Create local account"
                  : "Sign in with local BFF auth"}
            </Button>
            {authMode === "login" ? (
              <span className="text-muted-foreground text-sm">
                Default dev credentials: <code>demo</code> / <code>demo123</code>
              </span>
            ) : (
              <span className="text-muted-foreground text-sm">
                Registration is only available in local BFF auth mode.
              </span>
            )}
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void handleOidcSignIn()}>Sign in</Button>
          <span className="text-muted-foreground text-sm">
            You will be redirected to the configured identity provider.
          </span>
        </div>
      )}

      {localAuthError ? (
        <Alert className="mt-3" variant="destructive">
          <CircleAlert />
          <AlertTitle>
            {localMode && authMode === "register" ? "Local registration failed" : "Sign-in failed"}
          </AlertTitle>
          <AlertDescription>{localAuthError}</AlertDescription>
        </Alert>
      ) : null}
    </section>
  );
}
