import type { Model } from "./types";

type FetchLike = typeof fetch;

export async function loadModels(fetchImpl: FetchLike = fetch) {
  const res = await fetchImpl("/api/bff/models");
  if (!res.ok) {
    throw new Error("Failed to load models");
  }
  const { models } = (await res.json()) as { models: Model[] };
  return models;
}
