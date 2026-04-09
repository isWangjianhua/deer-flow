"use client";

import { useEffect, useState } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { loadBffUser, type BffUserResponse } from "@/core/auth/bff-user";
import { useBrowserAuthSession } from "@/core/auth/browser";
import { toAuthSessionState } from "@/core/auth/session";

import { LoginButton } from "./login-button";
import { LogoutButton } from "./logout-button";

export function AuthStatusCard() {
  const session = useBrowserAuthSession();
  const state = toAuthSessionState(session);
  const [bffUser, setBffUser] = useState<BffUserResponse | null>(null);
  const [bffError, setBffError] = useState<string | null>(null);

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

        {state.status === "unauthenticated" ? <LoginButton /> : null}
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
