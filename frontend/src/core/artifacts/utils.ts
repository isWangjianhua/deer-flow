import { getBackendBaseURL } from "../config";
import type { AgentThread } from "../threads";

export type ArtifactAPIMode = "gateway" | "bff";

export function urlOfArtifact({
  filepath,
  threadId,
  download = false,
  isMock = false,
  apiMode = "gateway",
}: {
  filepath: string;
  threadId: string;
  download?: boolean;
  isMock?: boolean;
  apiMode?: ArtifactAPIMode;
}) {
  if (isMock) {
    return `${getBackendBaseURL()}/mock/api/threads/${threadId}/artifacts${filepath}${download ? "?download=true" : ""}`;
  }
  if (apiMode === "bff") {
    return `/api/bff/conversations/${threadId}/artifacts${filepath}${download ? "?download=true" : ""}`;
  }
  return `${getBackendBaseURL()}/api/threads/${threadId}/artifacts${filepath}${download ? "?download=true" : ""}`;
}

export function extractArtifactsFromThread(thread: AgentThread) {
  return thread.values.artifacts ?? [];
}

export function resolveArtifactURL(
  absolutePath: string,
  threadId: string,
  apiMode: ArtifactAPIMode = "gateway",
) {
  if (apiMode === "bff") {
    return `/api/bff/conversations/${threadId}/artifacts${absolutePath}`;
  }
  return `${getBackendBaseURL()}/api/threads/${threadId}/artifacts${absolutePath}`;
}
