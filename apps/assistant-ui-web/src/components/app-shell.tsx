"use client";

import type { ReactNode } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { MessageSquarePlusIcon, MessagesSquareIcon } from "lucide-react";

import type { ThreadListItem } from "../lib/runtime/thread-list-runtime";

type AppShellProps = Readonly<{
  threads?: ThreadListItem[];
  activeThreadId?: string | null;
  children: ReactNode;
}>;

export function AppShell({ threads = [], activeThreadId, children }: AppShellProps) {
  return (
    <SidebarProvider defaultOpen>
      <Sidebar collapsible="offcanvas">
        <SidebarHeader className="mb-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild>
                <Link href="/workspace/new">
                  <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                    <MessagesSquareIcon className="size-4" />
                  </div>
                  <div className="flex flex-col gap-0.5 leading-none">
                    <span className="font-semibold">DeerFlow</span>
                    <span className="text-xs text-sidebar-foreground/55">assistant-ui</span>
                  </div>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent className="px-2">
          <Button asChild className="mb-2 h-9 justify-start gap-2 rounded-lg px-3 text-sm" variant="outline">
            <Link href="/workspace/new">
              <MessageSquarePlusIcon className="size-4" />
              New Thread
            </Link>
          </Button>

          <SidebarMenu>
            {threads.map((thread) => {
              const isActive = thread.threadId === activeThreadId;

              return (
                <SidebarMenuItem key={thread.threadId}>
                  <SidebarMenuButton asChild isActive={isActive} tooltip={thread.title || "Untitled conversation"}>
                    <Link
                      className={cn(
                        "flex items-center",
                        isActive && "font-medium",
                      )}
                      href={`/workspace/${thread.threadId}`}
                    >
                      <span className="truncate">{thread.title || "Untitled conversation"}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <div className="px-2 py-1 text-xs text-sidebar-foreground/50">
                {threads.length} conversation{threads.length === 1 ? "" : "s"}
              </div>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="min-h-svh">{children}</SidebarInset>
    </SidebarProvider>
  );
}
