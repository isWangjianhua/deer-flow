"use client";

import { Button } from "@/components/ui/button";
import { useCanvas } from "@/components/workspace/canvas-context";
import { extractReadPath } from "@/lib/tool-ui";

import { ToolEmptyState, ToolMetaRow, ToolStack } from "./common";

type WriteFileToolProps = Readonly<{
  args?: Record<string, unknown>;
}>;

export function WriteFileToolUI({ args }: WriteFileToolProps) {
  const canvas = useCanvas();
  const path = extractReadPath(args);

  return (
    <ToolStack>
      {path ? (
        <>
          <ToolMetaRow label="Artifact" value={path} />
          {canvas?.canOpenCanvas && canvas.hasArtifact(path) ? (
            <div>
              <Button
                onClick={() => {
                  canvas.openArtifact(path);
                }}
                size="sm"
                variant="secondary"
              >
                Open in canvas
              </Button>
            </div>
          ) : null}
        </>
      ) : (
        <ToolEmptyState>No artifact path provided.</ToolEmptyState>
      )}
    </ToolStack>
  );
}
