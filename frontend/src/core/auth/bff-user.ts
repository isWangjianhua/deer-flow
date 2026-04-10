import { getLocalBffHeaderName, isLocalDevAuthMode, readLocalBffAccessToken } from "./local";

export type BffUserResponse = {
  id?: string;
  username?: string;
  email?: string | null;
  code?: string;
  message?: string;
};

type FetchLike = typeof fetch;

function buildAuthHeaders() {
  if (!isLocalDevAuthMode()) {
    return undefined;
  }

  const token = readLocalBffAccessToken();
  if (!token) {
    return undefined;
  }

  return {
    [getLocalBffHeaderName()]: token,
  };
}

export async function loadBffUser(fetchImpl: FetchLike = fetch) {
  const response = await fetchImpl("/api/bff/me", {
    headers: buildAuthHeaders(),
  });
  const payload = (await response.json()) as BffUserResponse;

  if (!response.ok) {
    throw new Error(payload.message ?? "Failed to load BFF user");
  }

  return payload;
}
