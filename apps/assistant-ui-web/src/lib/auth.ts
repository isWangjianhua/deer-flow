import { buildGatewayUrl } from "./config";
import { throwIfUnauthorized } from "./auth-errors";

export type CurrentUser = {
  id: string;
  username: string;
};

type AuthSuccessPayload = CurrentUser & {
  session_token: string;
};

type AuthPayload = {
  username: string;
  password: string;
};

type WaitForAuthenticatedUserOptions = {
  maxAttempts?: number;
  delayMs?: number;
};

const DEFAULT_SESSION_CONFIRM_ATTEMPTS = 5;
const DEFAULT_SESSION_CONFIRM_DELAY_MS = 75;
const SESSION_STORAGE_KEY = "deerflow.session-token";

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const message = response.ok ? "" : await response.text();
  throwIfUnauthorized(response.status, message || undefined);

  if (!response.ok) {
    throw new Error(message || `Gateway request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

function canUseSessionStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function getStoredSessionToken(): string | null {
  if (!canUseSessionStorage()) {
    return null;
  }
  return window.localStorage.getItem(SESSION_STORAGE_KEY);
}

function storeSessionToken(sessionToken: string | null) {
  if (!canUseSessionStorage()) {
    return;
  }

  if (sessionToken) {
    window.localStorage.setItem(SESSION_STORAGE_KEY, sessionToken);
    return;
  }

  window.localStorage.removeItem(SESSION_STORAGE_KEY);
}

export function withGatewayAuthHeaders(headers?: HeadersInit): Headers {
  const nextHeaders = new Headers(headers);
  const sessionToken = getStoredSessionToken();
  if (sessionToken) {
    nextHeaders.set("X-DeerFlow-Session", sessionToken);
  }
  return nextHeaders;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const response = await fetch(buildGatewayUrl("/api/auth/me"), {
    credentials: "include",
    cache: "no-store",
    headers: withGatewayAuthHeaders(),
  });

  if (response.status === 401) {
    return null;
  }

  return parseJsonResponse<CurrentUser>(response);
}

function sleep(delayMs: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

export async function waitForAuthenticatedUser(
  options: WaitForAuthenticatedUserOptions = {},
): Promise<CurrentUser> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_SESSION_CONFIRM_ATTEMPTS;
  const delayMs = options.delayMs ?? DEFAULT_SESSION_CONFIRM_DELAY_MS;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const user = await getCurrentUser();
    if (user) {
      return user;
    }

    if (attempt < maxAttempts - 1 && delayMs > 0) {
      await sleep(delayMs);
    }
  }

  throw new Error("Authentication succeeded but the session cookie was not available yet.");
}

async function sendAuthRequest(path: string, payload: AuthPayload) {
  const response = await fetch(buildGatewayUrl(path), {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const user = await parseJsonResponse<AuthSuccessPayload>(response);
  storeSessionToken(user.session_token);
  await waitForAuthenticatedUser();
}

export async function login(username: string, password: string): Promise<void> {
  await sendAuthRequest("/api/auth/login", { username, password });
}

export async function register(username: string, password: string): Promise<void> {
  await sendAuthRequest("/api/auth/register", { username, password });
}

export async function logout(): Promise<void> {
  const response = await fetch(buildGatewayUrl("/api/auth/logout"), {
    method: "POST",
    credentials: "include",
    headers: withGatewayAuthHeaders(),
  });

  if (!response.ok && response.status !== 204) {
    const message = await response.text();
    throw new Error(message || `Gateway request failed with ${response.status}`);
  }

  storeSessionToken(null);
}
