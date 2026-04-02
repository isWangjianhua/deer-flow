"use client";

import { ExternalLinkIcon, FileTextIcon, LayoutPanelTopIcon } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type CanvasPanelProps = Readonly<{
  artifacts: string[];
  title: string;
}>;

function getArtifactName(path: string): string {
  const segments = path.split("/").filter(Boolean);
  return segments.at(-1) ?? path;
}

function getArtifactKind(path: string): string {
  const name = getArtifactName(path);
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === name.length - 1) {
    return "file";
  }

  return name.slice(dotIndex + 1).toUpperCase();
}

export function CanvasPanel({ artifacts, title }: CanvasPanelProps) {
  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-border/70 bg-muted/20">
      <div className="border-b border-border/70 px-4 py-4 md:px-5">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          <LayoutPanelTopIcon className="size-3.5" />
          Canvas
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

      <div className="flex-1 overflow-y-auto p-4 md:p-5">
        {artifacts.length === 0 ? (
          <Card className="border-dashed bg-background/80">
            <CardHeader className="gap-3">
              <CardTitle className="text-base">Canvas is empty</CardTitle>
              <CardDescription>
                Ask DeerFlow to create a file or report to populate this panel.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="space-y-3">
            {artifacts.map((artifactPath) => (
              <Card className="gap-4 bg-background/90" key={artifactPath}>
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
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground",
                      )}
                    >
                      {getArtifactKind(artifactPath)}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <a
                    className="inline-flex items-center gap-2 text-sm font-medium text-foreground underline-offset-4 hover:underline"
                    href={artifactPath}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Open artifact
                    <ExternalLinkIcon className="size-3.5" />
                  </a>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
