import { buildGatewayUrl } from "@/lib/config";

export type CurrentUser = {
  id: string;
  username: string;
};

type AuthPayload = {
  username: string;
  password: string;
};

async function parseJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Gateway request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const response = await fetch(buildGatewayUrl("/api/auth/me"), {
    credentials: "include",
    cache: "no-store",
  });

  if (response.status === 401) {
    return null;
  }

  return parseJsonResponse<CurrentUser>(response);
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

  await parseJsonResponse<CurrentUser>(response);
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
  });

  if (!response.ok && response.status !== 204) {
    const message = await response.text();
    throw new Error(message || `Gateway request failed with ${response.status}`);
  }
}
