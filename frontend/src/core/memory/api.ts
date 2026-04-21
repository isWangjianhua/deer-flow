import type { UserMemory } from "./types";

async function readMemoryResponse(
  response: Response,
  fallbackMessage: string,
): Promise<UserMemory> {
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      detail?: string;
      message?: string;
    };
    throw new Error(payload.detail ?? payload.message ?? fallbackMessage);
  }

  return response.json() as Promise<UserMemory>;
}

export async function loadMemory(): Promise<UserMemory> {
  const response = await fetch("/api/bff/memory");
  return readMemoryResponse(response, "Failed to fetch memory");
}
