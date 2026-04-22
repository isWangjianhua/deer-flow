"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  BotIcon,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { isAgentsUiEnabled } from "@/core/agents/feature";
import {
  deleteConversation,
  listConversations,
  renameConversation,
  setConversationPinned,
} from "@/core/bff-chat";
import type { BffConversation } from "@/core/bff-chat";
import { isBffChatRoute, pathOfConversation } from "@/core/bff-chat/ui";
import { useI18n } from "@/core/i18n/hooks";
import { isIMEComposing } from "@/lib/ime";

export function RecentChatList() {
  const pathname = usePathname();

  if (isBffChatRoute(pathname) || pathname === "/workspace/account") {
    return <BffRecentChatList pathname={pathname} />;
  }

  if (pathname.startsWith("/workspace/agents")) {
    return isAgentsUiEnabled() ? <BffRecentChatList pathname={pathname} /> : null;
  }

  return null;
}

function BffRecentChatList({ pathname }: { pathname: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: conversations = [] } = useQuery({
    queryKey: ["bff", "conversations"],
    queryFn: () => listConversations(),
    refetchOnWindowFocus: false,
  });
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameConversationId, setRenameConversationId] = useState<string | null>(
    null,
  );
  const [renameValue, setRenameValue] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConversationId, setDeleteConversationId] = useState<string | null>(
    null,
  );

  const sortConversations = useCallback((items: BffConversation[]) => {
    return [...items].sort((left, right) => {
      if (left.is_pinned !== right.is_pinned) {
        return left.is_pinned ? -1 : 1;
      }

      if (left.is_pinned && right.is_pinned) {
        return (
          new Date(right.pinned_at ?? 0).getTime() -
          new Date(left.pinned_at ?? 0).getTime()
        );
      }

      return (
        new Date(right.updated_at).getTime() -
        new Date(left.updated_at).getTime()
      );
    });
  }, []);

  const updateConversationCache = useCallback(
    (updatedConversation: BffConversation) => {
      queryClient.setQueryData(
        ["bff", "conversations"],
        (oldData: BffConversation[] | undefined) => {
          const merged = oldData?.map((conversation) => {
            if (conversation.id === updatedConversation.id) {
              return {
                ...conversation,
                ...updatedConversation,
              };
            }
            return conversation;
          });

          return merged ? sortConversations(merged) : merged;
        },
      );
    },
    [queryClient, sortConversations],
  );

  const closeRenameDialog = useCallback(() => {
    setRenameDialogOpen(false);
    setRenameConversationId(null);
    setRenameValue("");
  }, []);

  const closeDeleteDialog = useCallback(() => {
    setDeleteDialogOpen(false);
    setDeleteConversationId(null);
  }, []);

  const { mutate: renameConversationMutation } = useMutation({
    mutationFn: async ({
      conversationId,
      title,
    }: {
      conversationId: string;
      title: string;
    }) => renameConversation(conversationId, title),
    onSuccess(updatedConversation) {
      updateConversationCache(updatedConversation);
      closeRenameDialog();
    },
    onError() {
      toast.error("Failed to rename conversation");
    },
    onSettled() {
      void queryClient.invalidateQueries({ queryKey: ["bff", "conversations"] });
    },
  });

  const { mutate: pinConversationMutation } = useMutation({
    mutationFn: async ({
      conversationId,
      isPinned,
    }: {
      conversationId: string;
      isPinned: boolean;
    }) => setConversationPinned(conversationId, isPinned),
    onSuccess(updatedConversation) {
      updateConversationCache(updatedConversation);
    },
    onError() {
      toast.error("Failed to update pinned conversation");
    },
    onSettled() {
      void queryClient.invalidateQueries({ queryKey: ["bff", "conversations"] });
    },
  });

  const { mutate: deleteConversationMutation } = useMutation({
    mutationFn: async ({ conversationId }: { conversationId: string }) =>
      deleteConversation(conversationId),
    onSuccess(_, { conversationId }) {
      queryClient.setQueryData(
        ["bff", "conversations"],
        (oldData: BffConversation[] | undefined) => {
          return oldData?.filter(
            (conversation) => conversation.id !== conversationId,
          );
        },
      );

      const deletedConversation = conversations.find(
        (conversation) => conversation.id === conversationId,
      );

      if (
        deletedConversation &&
        pathname === pathOfConversation(deletedConversation)
      ) {
        const conversationIndex = conversations.findIndex(
          (conversation) => conversation.id === conversationId,
        );
        const nextConversation =
          conversationIndex > -1
            ? (conversations[conversationIndex + 1] ??
                conversations[conversationIndex - 1])
            : null;
        const nextHref = nextConversation
          ? pathOfConversation(nextConversation)
          : "/workspace/chats/new";
        void router.push(nextHref);
      }
    },
    onError() {
      toast.error("Failed to delete conversation");
    },
    onSettled() {
      void queryClient.invalidateQueries({ queryKey: ["bff", "conversations"] });
    },
  });

  const handleRenameClick = useCallback(
    (conversationId: string, currentTitle: string) => {
      setRenameConversationId(conversationId);
      setRenameValue(currentTitle);
      setRenameDialogOpen(true);
    },
    [],
  );

  const handleRenameSubmit = useCallback(() => {
    const title = renameValue.trim();
    if (renameConversationId && title) {
      renameConversationMutation({
        conversationId: renameConversationId,
        title,
      });
    }
  }, [renameConversationId, renameConversationMutation, renameValue]);

  const handleDelete = useCallback(
    (conversationId: string) => {
      setDeleteConversationId(conversationId);
      setDeleteDialogOpen(true);
    },
    [],
  );

  const handlePinToggle = useCallback(
    (conversationId: string, isPinned: boolean) => {
      pinConversationMutation({ conversationId, isPinned });
    },
    [pinConversationMutation],
  );

  const handleDeleteConfirm = useCallback(() => {
    if (!deleteConversationId) {
      return;
    }

    deleteConversationMutation({ conversationId: deleteConversationId });
    closeDeleteDialog();
  }, [closeDeleteDialog, deleteConversationId, deleteConversationMutation]);

  const deleteConversationTitle =
    conversations.find((conversation) => conversation.id === deleteConversationId)
      ?.title?.trim() ?? t.pages.untitled;

  const handleDeleteDialogChange = useCallback(
    (open: boolean) => {
      if (open) {
        setDeleteDialogOpen(true);
        return;
      }
      closeDeleteDialog();
    },
    [closeDeleteDialog],
  );

  if (conversations.length === 0) {
    return null;
  }

  return (
    <>
      <SidebarGroup>
        <SidebarGroupLabel>{t.sidebar.recentChats}</SidebarGroupLabel>
        <SidebarGroupContent className="group-data-[collapsible=icon]:pointer-events-none group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0">
          <SidebarMenu>
            <div className="flex w-full flex-col gap-1">
              {conversations.map((conversation) => {
                const href = pathOfConversation(conversation);
                const isActive = href === pathname;
                const displayTitle =
                  conversation.title?.trim() ?? t.pages.untitled;
                const editableTitle = conversation.title?.trim() ?? "";

                return (
                  <SidebarMenuItem
                    key={conversation.id}
                    className="group/side-menu-item"
                  >
                    <SidebarMenuButton isActive={isActive} asChild>
                      <div className="flex w-full items-center">
                        <Link
                          className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden whitespace-nowrap text-inherit"
                          href={href}
                        >
                          {conversation.agent_name ? (
                            <BotIcon className="size-3 shrink-0 opacity-55" />
                          ) : conversation.is_pinned ? (
                            <Pin className="size-3 shrink-0 opacity-55" />
                          ) : null}
                          <span className="truncate">{displayTitle}</span>
                        </Link>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <SidebarMenuAction
                              showOnHover
                              className="opacity-70 hover:opacity-100"
                            >
                              <MoreHorizontal />
                              <span className="sr-only">{t.common.more}</span>
                            </SidebarMenuAction>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            className="w-48 rounded-lg"
                            side={"right"}
                            align={"start"}
                          >
                            <DropdownMenuItem
                              onSelect={() =>
                                handlePinToggle(
                                  conversation.id,
                                  !conversation.is_pinned,
                                )
                              }
                            >
                              {conversation.is_pinned ? (
                                <PinOff className="text-muted-foreground" />
                              ) : (
                                <Pin className="text-muted-foreground" />
                              )}
                              <span>
                                {conversation.is_pinned
                                  ? t.common.unpin
                                  : t.common.pin}
                              </span>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() =>
                                handleRenameClick(conversation.id, editableTitle)
                              }
                            >
                              <Pencil className="text-muted-foreground" />
                              <span>{t.common.rename}</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => handleDelete(conversation.id)}
                            >
                              <Trash2 className="text-muted-foreground" />
                              <span>{t.common.delete}</span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </div>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <Dialog
        open={renameDialogOpen}
        onOpenChange={(open) => {
          if (open) {
            setRenameDialogOpen(true);
            return;
          }
          closeRenameDialog();
        }}
      >
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>{t.common.rename}</DialogTitle>
          </DialogHeader>
          <div className="pt-1">
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              placeholder={t.common.rename}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isIMEComposing(e)) {
                  e.preventDefault();
                  handleRenameSubmit();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeRenameDialog}>
              {t.common.cancel}
            </Button>
            <Button onClick={handleRenameSubmit}>{t.common.save}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={handleDeleteDialogChange}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>{t.common.delete}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5 pt-1">
            <p className="text-sm">{t.conversation.deleteConfirm}</p>
            <p className="text-muted-foreground truncate text-sm">
              {deleteConversationTitle}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDeleteDialog}>
              {t.common.cancel}
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm}>
              {t.common.delete}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
