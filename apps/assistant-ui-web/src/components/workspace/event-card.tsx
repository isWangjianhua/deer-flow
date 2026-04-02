"use client";

import { useState } from "react";
import { ChevronRightIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type EventCardProps = Readonly<{
  title: string;
  summary: string;
  status?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}>;

export function EventCard({
  title,
  summary,
  status,
  defaultOpen = false,
  children,
}: EventCardProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <details
      className="group overflow-hidden rounded-2xl border border-border/70 bg-card/70 shadow-sm"
      onToggle={(event) => {
        setIsOpen(event.currentTarget.open);
      }}
      open={isOpen}
    >
      <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 text-sm marker:hidden">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">{title}</span>
            {status ? (
              <span className="inline-flex items-center rounded-full border border-border/80 bg-background px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                {status}
              </span>
            ) : null}
          </div>
          <span className="mt-1 block truncate text-xs text-muted-foreground/80">{summary}</span>
        </div>
        <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-open:rotate-90" />
      </summary>
      <div className="space-y-3 border-t border-border/60 px-4 py-4 text-sm text-foreground">
        {children}
      </div>
    </details>
  );
}
