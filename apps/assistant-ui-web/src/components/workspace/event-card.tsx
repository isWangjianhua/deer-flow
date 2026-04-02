"use client";

import { ChevronRightIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type EventCardProps = Readonly<{
  title: string;
  summary: string;
  children: React.ReactNode;
}>;

export function EventCard({ title, summary, children }: EventCardProps) {
  return (
    <details className="overflow-hidden rounded-2xl border border-border bg-card/70 shadow-sm">
      <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-muted-foreground marker:hidden">
        <div className="flex flex-col">
          <span className="text-foreground">{title}</span>
          <span className="text-xs text-muted-foreground/70">{summary}</span>
        </div>
        <ChevronRightIcon className="transition-transform duration-150 group-open:rotate-90" />
      </summary>
      <div className="space-y-3 border-t border-border/60 px-4 py-4 text-sm text-foreground">
        {children}
      </div>
    </details>
  );
}
