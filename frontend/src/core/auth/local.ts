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

export const LOCAL_BFF_TOKEN_STORAGE_KEY = "deer-flow-local-bff-token";
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

export function getLocalBffHeaderName() {
  return "x-deerflow-local-bff-token";
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

export function readLocalDevSession() {
  if (typeof window === "undefined") {
    return null;
  }

  const stored = window.localStorage.getItem(LOCAL_BFF_SESSION_STORAGE_KEY);
  if (!stored) {
    return null;
  }

  try {
    const parsed = JSON.parse(stored) as BrowserSession;
    return {
      ...parsed,
      session: {
        ...parsed.session,
        createdAt: new Date(parsed.session.createdAt),
        updatedAt: new Date(parsed.session.updatedAt),
        expiresAt: new Date(parsed.session.expiresAt),
      },
      user: {
        ...parsed.user,
        createdAt: new Date(parsed.user.createdAt),
        updatedAt: new Date(parsed.user.updatedAt),
      },
    };
  } catch {
    return null;
  }
}

export function writeLocalDevSession(
  session: BrowserSession | null,
  accessToken?: string | null,
) {
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

  if (accessToken) {
    window.localStorage.setItem(LOCAL_BFF_TOKEN_STORAGE_KEY, accessToken);
  } else if (accessToken === null || !session) {
    window.localStorage.removeItem(LOCAL_BFF_TOKEN_STORAGE_KEY);
  }

  window.dispatchEvent(new Event(LOCAL_AUTH_EVENT));
}

export function readLocalBffAccessToken() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(LOCAL_BFF_TOKEN_STORAGE_KEY);
}
