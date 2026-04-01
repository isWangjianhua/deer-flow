import type { ReactNode } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { MessageSquarePlusIcon, PanelLeftIcon } from "lucide-react";

import type { ThreadListItem } from "../lib/runtime/thread-list-runtime";

type AppShellProps = Readonly<{
  threads?: ThreadListItem[];
  activeThreadId?: string | null;
  children: ReactNode;
}>;

export function AppShell({ threads = [], activeThreadId, children }: AppShellProps) {
  return (
    <div className="grid min-h-screen bg-background text-foreground lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:block">
        <div className="flex h-full flex-col px-4 py-5">
          <div className="mb-5 flex items-center justify-between px-2">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-xl border border-sidebar-border bg-sidebar-accent/60">
                <PanelLeftIcon className="size-4" />
              </div>
              <div>
                <p className="text-base font-semibold tracking-tight text-sidebar-foreground">
                  assistant-ui
                </p>
                <p className="text-xs text-sidebar-foreground/45">DeerFlow Gateway</p>
              </div>
            </div>
          </div>

          <Button
            asChild
            className="h-10 justify-start rounded-xl border border-sidebar-border bg-transparent px-4 text-sm font-medium text-sidebar-foreground shadow-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            variant="outline"
          >
            <Link href="/workspace/new">
              <MessageSquarePlusIcon className="mr-2 size-4" />
              New Thread
            </Link>
          </Button>

          <Separator className="my-5 bg-sidebar-border" />

          <div className="mb-2 flex items-center justify-between px-2">
            <h2 className="text-xs font-medium tracking-tight text-sidebar-foreground/55">
              Conversations
            </h2>
            <span className="rounded-full border border-sidebar-border px-2 py-0.5 text-[11px] text-sidebar-foreground/45">
              {threads.length}
            </span>
          </div>

          <ul className="flex flex-1 flex-col gap-1 overflow-y-auto pr-1">
            {threads.map((thread) => {
              const isActive = thread.threadId === activeThreadId;

              return (
                <li key={thread.threadId}>
                  <Link
                    className={cn(
                      "block rounded-xl px-3 py-2 transition-colors",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                    )}
                    href={`/workspace/${thread.threadId}`}
                  >
                    <div className="line-clamp-1 text-sm font-medium">
                      {thread.title || "Untitled conversation"}
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
