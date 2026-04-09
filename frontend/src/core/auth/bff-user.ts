export type BffUserResponse = {
  id?: string;
  username?: string;
  email?: string | null;
  code?: string;
  message?: string;
};

type FetchLike = typeof fetch;

export async function loadBffUser(fetchImpl: FetchLike = fetch) {
  const response = await fetchImpl("/api/bff/me");
  const payload = (await response.json()) as BffUserResponse;

  if (!response.ok) {
    throw new Error(payload.message ?? "Failed to load BFF user");
  }

  return payload;
}
