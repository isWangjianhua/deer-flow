import { env } from "../../env.js";

import type { BffUserResponse } from "./bff-user";

export type BrowserSession = {
  session: {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    userId: string;
    expiresAt: Date;
    token: string;
    ipAddress?: string | null;
    userAgent?: string | null;
  };
  user: {
    id: string;
    email?: string | null;
    name?: string | null;
    emailVerified: boolean;
    createdAt: Date;
    updatedAt: Date;
    image?: string | null;
  };
};

export const LOCAL_BFF_SESSION_STORAGE_KEY = "deer-flow-local-bff-session";
export const LOCAL_AUTH_EVENT = "deer-flow:auth-local-changed";

export function isLocalDevAuthMode(
  config: { NEXT_PUBLIC_AUTH_MODE?: string } = env,
) {
  return config.NEXT_PUBLIC_AUTH_MODE === "local";
}

export function getBffLocalAuthCookieName() {
  return "deer-flow-local-bff-token";
}

export function toLocalDevSession(user: BffUserResponse): BrowserSession {
  const now = new Date();

  return {
    session: {
      id: "local-dev-session",
      createdAt: now,
      updatedAt: now,
      userId: user.id ?? user.username ?? "demo",
      expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      token: "local-dev-session",
      ipAddress: null,
      userAgent: "local-dev-auth",
    },
    user: {
      id: user.id ?? user.username ?? "demo",
      email: user.email ?? null,
      name: user.username ?? "demo",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
      image: null,
    },
  };
}

function toDate(value: unknown) {
  return value instanceof Date ? value : new Date(String(value));
}

export function normalizeStoredBrowserSession(
  value: unknown,
): BrowserSession | null {
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

export function readLocalDevSession() {
  if (typeof window === "undefined") {
    return null;
  }

  const stored = window.localStorage.getItem(LOCAL_BFF_SESSION_STORAGE_KEY);
  if (!stored) {
    return null;
  }

  try {
    return normalizeStoredBrowserSession(JSON.parse(stored));
  } catch {
    return null;
  }
}

export function writeLocalDevSession(session: BrowserSession | null) {
  if (typeof window === "undefined") {
    return;
  }

  if (session) {
    window.localStorage.setItem(
      LOCAL_BFF_SESSION_STORAGE_KEY,
      JSON.stringify(session),
    );
  } else {
    window.localStorage.removeItem(LOCAL_BFF_SESSION_STORAGE_KEY);
  }

  window.dispatchEvent(new Event(LOCAL_AUTH_EVENT));
}
