"use client";

import { cn } from "@/lib/utils";

export function WorkspaceMessage({
  children,
  className,
  from,
}: {
  children: React.ReactNode;
  className?: string;
  from: "user" | "assistant";
}) {
  return (
    <div
      className={cn(
        "group flex w-full flex-col gap-2",
        from === "user" ? "is-user ml-auto justify-end" : "is-assistant",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function WorkspaceMessageContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "is-user:dark flex w-fit max-w-full min-w-0 flex-col gap-2 overflow-visible",
        "group-[.is-user]:overflow-hidden",
        "group-[.is-user]:bg-secondary group-[.is-user]:text-foreground group-[.is-user]:ml-auto group-[.is-user]:rounded-lg group-[.is-user]:px-4 group-[.is-user]:py-3",
        "group-[.is-assistant]:text-foreground",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function WorkspaceMessageToolbar({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("mt-4 flex w-full items-center justify-between gap-4", className)}
    >
      {children}
    </div>
  );
}
