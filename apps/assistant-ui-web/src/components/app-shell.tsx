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
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { PanelLeftCloseIcon, SettingsIcon, SquarePenIcon, UserCircleIcon, LogOutIcon } from "lucide-react";

import type { ThreadListItem } from "../lib/runtime/thread-list-runtime";
import type { CurrentUser } from "@/lib/auth";
import { performLogout } from "../lib/logout-action";

type AppShellProps = Readonly<{
  threads?: ThreadListItem[];
  activeThreadId?: string | null;
  currentUser?: CurrentUser | null;
  children: ReactNode;
}>;

export function AppShell({ threads = [], activeThreadId, currentUser, children }: AppShellProps) {
  return (
    <SidebarProvider defaultOpen>
      <Sidebar collapsible="icon">
        <SidebarHeader className="h-14 flex flex-row items-center justify-between px-4 pb-2 pt-4 group-data-[collapsible=icon]:px-1 group-data-[collapsible=icon]:justify-center">
          <span className="font-bold text-lg tracking-wide group-data-[collapsible=icon]:hidden">DeerFlow</span>
          <SidebarTrigger className="-mr-2 group-data-[collapsible=icon]:m-0 group-data-[collapsible=icon]:mb-2" />
        </SidebarHeader>

        <SidebarContent className="px-3 mt-2 group-data-[collapsible=icon]:px-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild className="mb-6 h-9 w-full justify-start gap-2 rounded-sm px-2 text-sm font-medium transition-colors hover:bg-muted/50" variant="default">
                <Link href="/workspace/new">
                  <SquarePenIcon className="size-4 opacity-70" />
                  <span className="group-data-[collapsible=icon]:hidden">新对话</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>

          <div className="flex px-1 pb-3 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">历史对话</div>

          <SidebarMenu className="gap-0.5 group-data-[collapsible=icon]:hidden">
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
              <div className="group/user relative">
                <SidebarMenuButton className="flex items-center gap-2 px-3 py-4 text-muted-foreground hover:text-foreground">
                  <UserCircleIcon className="size-5 shrink-0" />
                  <span className="text-sm font-medium truncate group-data-[collapsible=icon]:hidden">
                    {currentUser?.username || "Guest"}
                  </span>
                </SidebarMenuButton>
                <div className="invisible absolute left-0 bottom-full pb-1 opacity-0 transition-all group-hover/user:visible group-hover/user:opacity-100 z-50">
                  <div className="w-32 ml-1 rounded-md border border-border/60 bg-popover p-1 shadow-md">
                    <button
                      className="flex w-full items-center gap-2 px-2 py-1.5 text-sm hover:bg-muted text-red-500 rounded-sm"
                      onClick={() => {
                        void performLogout((href) => {
                          window.location.href = href;
                        }).catch((error) => {
                          console.error("Failed to log out", error);
                        });
                      }}
                    >
                      <LogOutIcon className="size-4 shrink-0" />
                      退出
                    </button>
                  </div>
                </div>
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
