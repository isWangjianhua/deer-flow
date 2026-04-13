"use client";

import { useEffect, useState } from "react";

import { resolveStoredBrowserAuthSession } from "@/core/auth/browser-state";
import { getOidcProviderId } from "@/core/auth/config";
import {
  type BrowserSession,
  isLocalDevAuthMode,
  readLocalDevSession,
  writeLocalDevSession,
} from "@/core/auth/local";
import { authClient } from "@/server/better-auth/client";

const MOCK_AUTH_EVENT = "deer-flow:auth-mock-changed";
const MOCK_AUTH_STORAGE_KEY = "deer-flow:auth-mock-session";

type BrowserAuthSession = {
  data: {
    session?: { id: string };
    user: { id: string; email?: string | null; name?: string | null };
  } | null;
  isPending: boolean;
  error: { message?: string } | null;
};

function toDate(value: unknown) {
  return value instanceof Date ? value : new Date(String(value));
}

function normalizeStoredSession(value: unknown): BrowserSession | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as {
    session?: Record<string, unknown>;
    user?: Record<string, unknown>;
  };

  if (!candidate.session || !candidate.user) {
    return null;
  }

  return {
    session: {
      ...candidate.session,
      createdAt: toDate(candidate.session.createdAt),
      updatedAt: toDate(candidate.session.updatedAt),
      expiresAt: toDate(candidate.session.expiresAt),
    },
    user: {
      ...candidate.user,
      createdAt: toDate(candidate.user.createdAt),
      updatedAt: toDate(candidate.user.updatedAt),
    },
  } as BrowserSession;
}

function isMockAuthEnabled() {
  return process.env.NEXT_PUBLIC_AUTH_E2E_MOCK === "1";
}

function readMockSession() {
  if (typeof window === "undefined") {
    return null;
  }

  const stored = window.localStorage.getItem(MOCK_AUTH_STORAGE_KEY);
  if (!stored) {
    return null;
  }

  try {
    return normalizeStoredSession(JSON.parse(stored));
  } catch {
    return null;
  }
}

function writeMockSession(session: BrowserSession | null) {
  if (typeof window === "undefined") {
    return;
  }

  if (session) {
    window.localStorage.setItem(MOCK_AUTH_STORAGE_KEY, JSON.stringify(session));
  } else {
    window.localStorage.removeItem(MOCK_AUTH_STORAGE_KEY);
  }

  window.dispatchEvent(new Event(MOCK_AUTH_EVENT));
}

function buildMockSession(): BrowserSession {
  return {
    session: {
      id: "mock-session",
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: "mock-user",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      token: "mock-token",
      ipAddress: null,
      userAgent: "playwright",
    },
    user: {
      id: "mock-user",
      email: "demo@example.com",
      name: "Demo User",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      image: null,
    },
  };
}

export function useBrowserAuthSession(): BrowserAuthSession {
  const liveSession = authClient.useSession();
  const [mockSession, setMockSession] = useState<BrowserSession | null>(null);
  const [localSession, setLocalSession] = useState<BrowserSession | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
    if (isLocalDevAuthMode()) {
      setLocalSession(readLocalDevSession());
    }
  }, []);

  useEffect(() => {
    if (!isMockAuthEnabled()) {
      return;
    }

    const sync = () => {
      setMockSession(readMockSession());
    };

    window.addEventListener(MOCK_AUTH_EVENT, sync);
    window.addEventListener("storage", sync);
    sync();

    return () => {
      window.removeEventListener(MOCK_AUTH_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  if (!isMockAuthEnabled()) {
    if (isLocalDevAuthMode()) {
      return resolveStoredBrowserAuthSession({
        hydrated: isHydrated,
        session: localSession,
      });
    }
    return liveSession;
  }

  return resolveStoredBrowserAuthSession({
    hydrated: isHydrated,
    session: mockSession,
  });
}

export async function signInWithOidc(callbackURL = "/workspace/account") {
  if (isLocalDevAuthMode()) {
    throw new Error("Use signInWithLocalPassword in local dev auth mode.");
  }

  if (isMockAuthEnabled()) {
    writeMockSession(buildMockSession());
    return;
  }

  await authClient.signIn.oauth2({
    providerId: getOidcProviderId(),
    callbackURL,
  });
}

export async function signOut() {
  if (isLocalDevAuthMode()) {
    await signOutLocal();
    return;
  }

  if (isMockAuthEnabled()) {
    writeMockSession(null);
    return;
  }

  await authClient.signOut();
}

export async function signInWithLocalPassword(
  username: string,
  password: string,
) {
  const response = await fetch("/api/auth/local/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    credentials: "same-origin",
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    const payload = (await response.json()) as { message?: string };
    throw new Error(payload.message ?? "Local sign in failed");
  }

  const payload = (await response.json()) as {
    accessToken?: string;
    session?: unknown;
  };
  const session = normalizeStoredSession(payload.session);
  writeLocalDevSession(session, payload.accessToken ?? null);
  return session;
}

export async function signUpWithLocalPassword(
  username: string,
  password: string,
) {
  const response = await fetch("/api/auth/local/register", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    credentials: "same-origin",
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    const payload = (await response.json()) as { message?: string };
    throw new Error(payload.message ?? "Local registration failed");
  }

  const payload = (await response.json()) as {
    accessToken?: string;
    session?: unknown;
  };
  const session = normalizeStoredSession(payload.session);
  writeLocalDevSession(session, payload.accessToken ?? null);
  return session;
}

export async function signOutLocal() {
  await fetch("/api/auth/local/logout", {
    method: "POST",
    credentials: "same-origin",
  });
  writeLocalDevSession(null, null);
}
