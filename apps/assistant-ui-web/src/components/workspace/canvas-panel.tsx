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
        "flex h-full min-h-0 flex-col border-l border-border/70 bg-muted/20",
        className,
      )}
    >
      <div className="border-b border-border/70 px-4 py-4 md:px-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            <LayoutPanelTopIcon className="size-3.5" />
            Canvas
          </div>
          <Button
            aria-label="Close canvas"
            className="size-8 shrink-0"
            onClick={onClose}
            size="icon"
            variant="ghost"
          >
            <XIcon className="size-4" />
          </Button>
        </div>
        <h2 className="mt-3 line-clamp-2 text-sm font-semibold text-foreground md:text-base">
          {title || "New Thread"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {artifacts.length === 0
            ? "Artifacts generated during the conversation will appear here."
            : `${artifacts.length} artifact${artifacts.length === 1 ? "" : "s"} available`}
        </p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {artifacts.length === 0 ? (
          <div className="p-4 md:p-5">
            <Card className="border-dashed bg-background/80">
              <CardHeader className="gap-3">
                <CardTitle className="text-base">Canvas is empty</CardTitle>
                <CardDescription>
                  Ask DeerFlow to create a file or report to populate this panel.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        ) : (
          <>
            <div className="border-b border-border/70 px-4 py-4 md:px-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    Preview
                  </p>
                  <h3 className="mt-2 truncate text-sm font-semibold text-foreground md:text-base">
                    {activeArtifact ? getArtifactName(activeArtifact) : "No artifact selected"}
                  </h3>
                  {activeArtifact ? (
                    <p className="mt-1 line-clamp-2 break-all font-mono text-xs text-muted-foreground">
                      {activeArtifact}
                    </p>
                  ) : null}
                </div>
                {activeArtifact ? (
                  <span className="inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    {getArtifactKindLabel(activeArtifact)}
                  </span>
                ) : null}
              </div>

              <div className="mt-4 flex items-center gap-2">
                {activeUrl ? (
                  <Button asChild size="sm" variant="secondary">
                    <a href={activeUrl} rel="noreferrer" target="_blank">
                      <ExternalLinkIcon className="size-4" />
                      Open
                    </a>
                  </Button>
                ) : (
                  <Button disabled size="sm" variant="secondary">
                    <ExternalLinkIcon className="size-4" />
                    Open
                  </Button>
                )}
                {activeDownloadUrl ? (
                  <Button asChild size="sm" variant="ghost">
                    <a href={activeDownloadUrl} rel="noreferrer" target="_blank">
                      <DownloadIcon className="size-4" />
                      Download
                    </a>
                  </Button>
                ) : (
                  <Button disabled size="sm" variant="ghost">
                    <DownloadIcon className="size-4" />
                    Download
                  </Button>
                )}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-5">
              <Card className="flex min-h-[18rem] flex-col overflow-hidden bg-background/90">
                <CardContent className="flex min-h-0 flex-1 flex-col p-0">
                  {activeArtifact && activeUrl ? (
                    activePreview === "image" ? (
                      <div className="flex flex-1 items-center justify-center bg-muted/20 p-4">
                        <img
                          alt={getArtifactName(activeArtifact)}
                          className="max-h-full max-w-full rounded-md border border-border/60 object-contain shadow-xs"
                          src={activeUrl}
                        />
                      </div>
                    ) : activePreview === "pdf" ? (
                      <iframe
                        className="min-h-[24rem] w-full flex-1 bg-background"
                        src={activeUrl}
                        title={getArtifactName(activeArtifact)}
                      />
                    ) : activePreview === "html" ? (
                      <iframe
                        className="min-h-[24rem] w-full flex-1 bg-background"
                        sandbox="allow-forms allow-same-origin allow-scripts"
                        src={activeUrl}
                        title={getArtifactName(activeArtifact)}
                      />
                    ) : activePreview === "markdown" ? (
                      previewLoading ? (
                        <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
                          Loading preview…
                        </div>
                      ) : previewError ? (
                        <div className="flex flex-1 items-center justify-center p-6 text-center">
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-foreground">
                              Markdown preview is unavailable.
                            </p>
                            <p className="text-sm text-muted-foreground">{previewError}</p>
                          </div>
                        </div>
                      ) : (
                        <CanvasMarkdownPreview content={previewContent} />
                      )
                    ) : activePreview === "text" ? (
                      previewLoading ? (
                        <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
                          Loading preview…
                        </div>
                      ) : previewError ? (
                        <div className="flex flex-1 items-center justify-center p-6 text-center">
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-foreground">
                              Text preview is unavailable.
                            </p>
                            <p className="text-sm text-muted-foreground">{previewError}</p>
                          </div>
                        </div>
                      ) : (
                        <pre className="min-h-[24rem] flex-1 overflow-auto bg-background p-4 text-xs leading-relaxed text-foreground/85">
                          {previewContent}
                        </pre>
                      )
                    ) : (
                      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
                        <FileTextIcon className="size-8 text-muted-foreground" />
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-foreground">
                            Preview is not available for this file type.
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Open or download the artifact to inspect its contents.
                          </p>
                        </div>
                      </div>
                    )
                  ) : (
                    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
                      <FileTextIcon className="size-8 text-muted-foreground" />
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-foreground">
                          Select an artifact to preview it.
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Generated files stay in the canvas instead of crowding the message thread.
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="max-h-80 shrink-0 overflow-y-auto border-t border-border/70 p-4 md:p-5">
              <div className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Artifacts
              </div>
              <div className="space-y-3">
                {artifacts.map((artifactPath) => {
                  const isSelected = artifactPath === activeArtifact;
                  return (
                    <Card
                      className={cn(
                        "gap-4 bg-background/90 transition-colors",
                        isSelected && "border-foreground/20 bg-accent/30",
                      )}
                      key={artifactPath}
                    >
                      <CardHeader className="gap-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <CardTitle className="flex items-center gap-2 text-sm">
                              <FileTextIcon className="size-4 text-muted-foreground" />
                              <span className="truncate">{getArtifactName(artifactPath)}</span>
                            </CardTitle>
                            <CardDescription className="mt-1 break-all font-mono text-xs">
                              {artifactPath}
                            </CardDescription>
                          </div>
                          <span className="inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                            {getArtifactKindLabel(artifactPath)}
                          </span>
                        </div>
                      </CardHeader>
                      <CardContent className="flex items-center justify-between gap-3 pt-0">
                        <Button
                          className="px-0 text-sm"
                          onClick={() => {
                            onSelectArtifact(artifactPath);
                          }}
                          variant="link"
                        >
                          {isSelected ? "Previewing" : "Preview"}
                        </Button>
                        {conversationId ? (
                          <a
                            className="inline-flex items-center gap-2 text-sm font-medium text-foreground underline-offset-4 hover:underline"
                            href={resolveArtifactUrl({
                              artifactPath,
                              conversationId,
                            })}
                            rel="noreferrer"
                            target="_blank"
                          >
                            Open
                            <ExternalLinkIcon className="size-3.5" />
                          </a>
                        ) : null}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
