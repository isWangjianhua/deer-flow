import type { ReactNode } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import type { ThreadListItem } from "../lib/runtime/thread-list-runtime";

type AppShellProps = Readonly<{
  threads?: ThreadListItem[];
  activeThreadId?: string | null;
  children: ReactNode;
}>;

export function AppShell({ threads = [], activeThreadId, children }: AppShellProps) {
  return (
    <div className="grid min-h-screen bg-[radial-gradient(circle_at_top,rgba(92,101,124,0.24),transparent_32%),linear-gradient(180deg,#111318_0%,#171a22_100%)] text-foreground lg:grid-cols-[290px_minmax(0,1fr)]">
      <aside className="border-sidebar-border/70 bg-sidebar/88 backdrop-blur-xl lg:border-r">
        <div className="flex h-full flex-col px-5 py-6">
          <div className="mb-8 flex items-end justify-between">
            <div>
              <p className="font-[family-name:var(--font-serif)] text-3xl leading-none text-sidebar-foreground">
                DeerFlow
              </p>
              <p className="mt-2 text-sm text-sidebar-foreground/55">Assistant UI prototype</p>
            </div>
          </div>

          <Button
            asChild
            className="h-11 justify-start rounded-xl bg-sidebar-primary text-sidebar-primary-foreground shadow-lg shadow-black/20 hover:bg-sidebar-primary/90"
          >
            <Link href="/workspace/new">New conversation</Link>
          </Button>

          <Separator className="my-6 bg-sidebar-border/70" />

          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-[0.22em] text-sidebar-foreground/40">
              Conversations
            </h2>
            <span className="rounded-full border border-sidebar-border/70 px-2 py-0.5 text-[11px] text-sidebar-foreground/45">
              {threads.length}
            </span>
          </div>

          <ul className="mt-4 flex flex-1 flex-col gap-1.5 overflow-y-auto pr-1">
            {threads.map((thread) => {
              const isActive = thread.threadId === activeThreadId;

              return (
                <li key={thread.threadId}>
                  <Link
                    className={cn(
                      "block rounded-2xl border px-4 py-3 transition-all",
                      isActive
                        ? "border-sidebar-ring/60 bg-sidebar-accent text-sidebar-accent-foreground shadow-md shadow-black/15"
                        : "border-transparent text-sidebar-foreground/70 hover:border-sidebar-border/80 hover:bg-sidebar-accent/55 hover:text-sidebar-foreground",
                    )}
                    href={`/workspace/${thread.threadId}`}
                  >
                    <div className="line-clamp-1 text-sm font-medium">
                      {thread.title || "Untitled conversation"}
                    </div>
                    <div className="mt-1 line-clamp-1 text-xs text-inherit/55">
                      {thread.threadId}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </aside>

      <main className="min-w-0">{children}</main>
    </div>
  );
}
