"use client";

import { useEffect, useState } from "react";

import { getOidcProviderId } from "@/core/auth/config";
import { authClient, type Session } from "@/server/better-auth/client";

const MOCK_AUTH_EVENT = "deer-flow:auth-mock-changed";
const MOCK_AUTH_STORAGE_KEY = "deer-flow:auth-mock-session";

type BrowserAuthSession = {
  data: Session | null;
  isPending: boolean;
  error: Error | null;
};

function toDate(value: unknown) {
  return value instanceof Date ? value : new Date(String(value));
}

function normalizeMockSession(value: unknown): Session | null {
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
  } as Session;
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
    return normalizeMockSession(JSON.parse(stored));
  } catch {
    return null;
  }
}

function writeMockSession(session: Session | null) {
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

function buildMockSession(): Session {
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
  const [mockSession, setMockSession] = useState<Session | null>(() =>
    readMockSession(),
  );

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
    return liveSession;
  }

  return {
    data: mockSession,
    isPending: false,
    error: null,
  };
}

export async function signInWithOidc() {
  if (isMockAuthEnabled()) {
    writeMockSession(buildMockSession());
    return;
  }

  await authClient.signIn.oauth2({
    providerId: getOidcProviderId(),
    callbackURL: "/workspace/account",
  });
}

export async function signOut() {
  if (isMockAuthEnabled()) {
    writeMockSession(null);
    return;
  }

  await authClient.signOut();
}
