"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { loadBffUser, type BffUserResponse } from "@/core/auth/bff-user";
import {
  signInWithLocalPassword,
  useBrowserAuthSession,
} from "@/core/auth/browser";
import { isLocalDevAuthMode } from "@/core/auth/local";
import { toAuthSessionState } from "@/core/auth/session";

import { LoginButton } from "./login-button";
import { LogoutButton } from "./logout-button";

export function AuthStatusCard() {
  const session = useBrowserAuthSession();
  const state = toAuthSessionState(session);
  const [bffUser, setBffUser] = useState<BffUserResponse | null>(null);
  const [bffError, setBffError] = useState<string | null>(null);
  const [username, setUsername] = useState("demo");
  const [password, setPassword] = useState("demo123");
  const [localLoginError, setLocalLoginError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
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

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Authentication</CardTitle>
        <CardDescription>
          Browser OIDC session plus the first authenticated BFF `/me` bridge.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1 text-sm">
          <div>Status: {state.status}</div>
          <div>User ID: {state.user?.id ?? "-"}</div>
          <div>Email: {state.user?.email ?? "-"}</div>
          <div>Name: {state.user?.name ?? "-"}</div>
        </div>

        {state.status === "unauthenticated" && localMode ? (
          <form className="space-y-3" onSubmit={handleLocalLogin}>
            <div className="text-sm font-medium">Local Dev Login</div>
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
            <Button disabled={isSubmitting} type="submit">
              {isSubmitting ? "Signing in..." : "Sign in with local BFF auth"}
            </Button>
            {localLoginError ? (
              <div className="text-destructive text-sm">{localLoginError}</div>
            ) : null}
          </form>
        ) : null}
        {state.status === "unauthenticated" && !localMode ? <LoginButton /> : null}
        {state.status === "authenticated" ? <LogoutButton /> : null}

        <div className="space-y-2">
          <div className="text-sm font-medium">BFF `/me`</div>
          {bffError ? (
            <pre className="bg-muted text-destructive overflow-x-auto rounded-md p-3 text-xs">
              {bffError}
            </pre>
          ) : (
            <pre className="bg-muted overflow-x-auto rounded-md p-3 text-xs">
              {JSON.stringify(bffUser, null, 2)}
            </pre>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
