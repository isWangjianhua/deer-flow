"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DownloadIcon,
  ExternalLinkIcon,
  FileTextIcon,
  LayoutPanelTopIcon,
  XIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CanvasMarkdownPreview } from "@/components/workspace/canvas-markdown-preview";
import {
  getArtifactKindLabel,
  getArtifactName,
  getArtifactPreviewKind,
  resolveArtifactUrl,
  selectCanvasArtifact,
} from "@/lib/artifacts";
import { withGatewayAuthHeaders } from "@/lib/auth";
import { cn } from "@/lib/utils";

type CanvasPanelProps = Readonly<{
  artifacts: string[];
  conversationId: string | null;
  title: string;
  selectedArtifact: string | null;
  onClose: () => void;
  onSelectArtifact: (artifactPath: string) => void;
  className?: string;
}>;

export function CanvasPanel({
  artifacts,
  conversationId,
  title,
  selectedArtifact,
  onClose,
  onSelectArtifact,
  className,
}: CanvasPanelProps) {
  const [previewContent, setPreviewContent] = useState<string>("");
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const activeArtifact = useMemo(
    () => selectCanvasArtifact(artifacts, selectedArtifact),
    [artifacts, selectedArtifact],
  );

  const activePreview = activeArtifact ? getArtifactPreviewKind(activeArtifact) : "none";
  const activeUrl =
    activeArtifact && conversationId
      ? resolveArtifactUrl({
          artifactPath: activeArtifact,
          conversationId,
        })
      : null;
  const activeDownloadUrl =
    activeArtifact && conversationId
      ? resolveArtifactUrl({
          artifactPath: activeArtifact,
          conversationId,
          download: true,
        })
      : null;

  useEffect(() => {
    if (!activeArtifact || !activeUrl) {
      setPreviewContent("");
      setPreviewError(null);
      setPreviewLoading(false);
      return;
    }

    if (activePreview !== "markdown" && activePreview !== "text") {
      setPreviewContent("");
      setPreviewError(null);
      setPreviewLoading(false);
      return;
    }

    const controller = new AbortController();
    setPreviewLoading(true);
    setPreviewContent("");
    setPreviewError(null);

    void fetch(activeUrl, {
      cache: "no-store",
      credentials: "include",
      headers: withGatewayAuthHeaders(),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Preview request failed with ${response.status}`);
        }
        return await response.text();
      })
      .then((content) => {
        setPreviewContent(content);
      })
      .catch((error: unknown) => {
        if ((error as Error)?.name === "AbortError") {
          return;
        }
        setPreviewError(error instanceof Error ? error.message : "Failed to load artifact.");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setPreviewLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [activeArtifact, activePreview, activeUrl]);

  return (
    <aside
      className={cn(
        "flex h-full min-h-0 flex-col border-l border-border/70 bg-background",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-border/70 px-4 py-3 bg-muted/20">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground truncate max-w-[250px] md:max-w-[400px]">
            {activeArtifact ? getArtifactName(activeArtifact) : "No document"}
          </span>
        </div>
        <div className="flex items-center gap-1 text-muted-foreground">
          {activeUrl ? (
            <Button size="icon" variant="ghost" className="size-8" asChild>
              <a href={activeUrl} rel="noreferrer" target="_blank">
                <ExternalLinkIcon className="size-4" />
              </a>
            </Button>
          ) : (
            <Button size="icon" variant="ghost" className="size-8" disabled>
              <ExternalLinkIcon className="size-4" />
            </Button>
          )}
          {activeDownloadUrl ? (
            <Button size="icon" variant="ghost" className="size-8" asChild>
              <a href={activeDownloadUrl} rel="noreferrer" target="_blank">
                <DownloadIcon className="size-4" />
              </a>
            </Button>
          ) : (
            <Button size="icon" variant="ghost" className="size-8" disabled>
              <DownloadIcon className="size-4" />
            </Button>
          )}
          <Button
            aria-label="Close canvas"
            className="size-8 shrink-0 hover:bg-red-500/10 hover:text-red-500 transition-colors"
            onClick={onClose}
            size="icon"
            variant="ghost"
          >
            <XIcon className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-auto bg-background p-4 md:p-8">
        {!activeArtifact || !activeUrl ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <FileTextIcon className="size-10 text-muted-foreground/30" />
            <p className="text-sm font-medium text-foreground">
              {artifacts.length === 0 ? "Document generation pending..." : "Select an artifact"}
            </p>
          </div>
        ) : activePreview === "image" ? (
          <div className="flex flex-1 items-center justify-center">
            <img
              alt={getArtifactName(activeArtifact)}
              className="max-h-full max-w-full rounded-md object-contain"
              src={activeUrl}
            />
          </div>
        ) : activePreview === "pdf" ? (
          <iframe
            className="h-full w-full flex-1"
            src={activeUrl}
            title={getArtifactName(activeArtifact)}
          />
        ) : activePreview === "html" ? (
          <iframe
            className="h-full w-full flex-1"
            sandbox="allow-forms allow-same-origin allow-scripts"
            src={activeUrl}
            title={getArtifactName(activeArtifact)}
          />
        ) : activePreview === "markdown" ? (
          previewLoading ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground animate-pulse">
              Loading document...
            </div>
          ) : previewError ? (
            <div className="flex flex-1 items-center justify-center text-center">
              <div className="space-y-1">
                <p className="text-sm font-medium text-red-400">Failed to load markdown.</p>
                <p className="text-xs text-muted-foreground">{previewError}</p>
              </div>
            </div>
          ) : (
            <CanvasMarkdownPreview content={previewContent} />
          )
        ) : activePreview === "text" ? (
          previewLoading ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground animate-pulse">
              Loading text...
            </div>
          ) : previewError ? (
            <div className="flex flex-1 items-center justify-center text-center">
              <div className="space-y-1">
                <p className="text-sm font-medium text-red-400">Failed to load text.</p>
                <p className="text-xs text-muted-foreground">{previewError}</p>
              </div>
            </div>
          ) : (
            <pre className="flex-1 overflow-auto bg-background text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
              {previewContent}
            </pre>
          )
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <FileTextIcon className="size-8 text-muted-foreground" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                Preview not supported
              </p>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
