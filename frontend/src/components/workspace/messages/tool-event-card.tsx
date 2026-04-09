"use client";

import * as Collapsible from "@radix-ui/react-collapsible";

import type { BffChatToolState } from "@/core/bff-chat";

type ToolEventCardProps = {
  tool: BffChatToolState;
};

export function ToolEventCard({ tool }: ToolEventCardProps) {
  return (
    <Collapsible.Root
      className="bg-muted/60 border-border mt-2 rounded-lg border"
      defaultOpen={tool.status === "running"}
    >
      <Collapsible.Trigger className="flex w-full items-center justify-between px-3 py-2 text-left text-sm">
        <span>{tool.label}</span>
        <span className="text-muted-foreground text-xs">{tool.status}</span>
      </Collapsible.Trigger>
      <Collapsible.Content className="border-t px-3 py-2 text-xs">
        {tool.summary ?? "Working..."}
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
