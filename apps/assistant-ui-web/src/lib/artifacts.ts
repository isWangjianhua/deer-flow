import { buildGatewayUrl } from "./config";

export type ArtifactPreviewKind =
  | "image"
  | "pdf"
  | "markdown"
  | "text"
  | "html"
  | "none";

export type CanvasState = {
  open: boolean;
  selectedArtifact: string | null;
};

const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "bmp",
  "ico",
]);

const TEXT_EXTENSIONS = new Set([
  "txt",
  "json",
  "yaml",
  "yml",
  "xml",
  "csv",
  "tsv",
  "log",
  "py",
  "ts",
  "tsx",
  "js",
  "jsx",
  "css",
  "scss",
  "html",
  "sql",
  "sh",
]);

export function getArtifactName(path: string): string {
  const segments = path.split("/").filter(Boolean);
  return segments.at(-1) ?? path;
}

export function getArtifactExtension(path: string): string | null {
  const name = getArtifactName(path);
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === name.length - 1) {
    return null;
  }

  return name.slice(dotIndex + 1).toLowerCase();
}

export function getArtifactKindLabel(path: string): string {
  const extension = getArtifactExtension(path);
  return extension ? extension.toUpperCase() : "FILE";
}

export function getArtifactPreviewKind(path: string): ArtifactPreviewKind {
  const extension = getArtifactExtension(path);
  if (!extension) {
    return "none";
  }

  if (IMAGE_EXTENSIONS.has(extension)) {
    return "image";
  }

  if (extension === "pdf") {
    return "pdf";
  }

  if (extension === "md" || extension === "mdx") {
    return "markdown";
  }

  if (extension === "html" || extension === "htm") {
    return "html";
  }

  if (TEXT_EXTENSIONS.has(extension)) {
    return "text";
  }

  return "none";
}

export function resolveArtifactUrl({
  artifactPath,
  conversationId,
  download = false,
}: {
  artifactPath: string;
  conversationId: string;
  download?: boolean;
}): string {
  const query = download ? "?download=true" : "";
  return buildGatewayUrl(`/api/threads/${conversationId}/artifacts${artifactPath}${query}`);
}

export function selectCanvasArtifact(
  artifacts: string[],
  currentSelection: string | null,
): string | null {
  if (artifacts.length === 0) {
    return null;
  }

  if (currentSelection && artifacts.includes(currentSelection)) {
    return currentSelection;
  }

  return artifacts[0] ?? null;
}

export function reconcileCanvasState(
  artifacts: string[],
  state: CanvasState,
): CanvasState {
  if (artifacts.length === 0) {
    return {
      open: false,
      selectedArtifact: null,
    };
  }

  if (state.selectedArtifact && artifacts.includes(state.selectedArtifact)) {
    return state;
  }

  return {
    open: state.open,
    selectedArtifact: null,
  };
}
