"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function ToolStack({
  children,
  className,
}: Readonly<{ children: ReactNode; className?: string }>) {
  return <div className={cn("space-y-3", className)}>{children}</div>;
}

export function ToolMetaRow({
  label,
  value,
}: Readonly<{ label: string; value: string }>) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </div>
      <div className="break-all text-sm text-foreground">{value}</div>
    </div>
  );
}

export function ToolCodeBlock({
  children,
  className,
}: Readonly<{ children: ReactNode; className?: string }>) {
  return (
    <pre
      className={cn(
        "max-h-56 overflow-auto rounded-xl border border-border/70 bg-background/70 px-3 py-2.5 text-xs leading-relaxed text-foreground/85",
        className,
      )}
    >
      {children}
    </pre>
  );
}

export function ToolEmptyState({
  children,
}: Readonly<{ children: ReactNode }>) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}
