"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useI18n } from "@/core/i18n/hooks";

import { AuthPanel } from "./auth-panel";

export function LoginRequiredDialog({
  open,
  onOpenChange,
  onAuthenticated,
  callbackURL,
  onBeforeOidcRedirect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAuthenticated: () => void;
  callbackURL: string;
  onBeforeOidcRedirect?: () => void;
}) {
  const { t } = useI18n();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden border bg-background p-0 shadow-xl sm:max-w-md">
        <DialogHeader className="gap-2 border-b px-5 pt-5 pb-4 text-left">
          <DialogTitle>{t.auth.loginRequiredTitle}</DialogTitle>
          <DialogDescription>
            {t.auth.loginRequiredDescription}
          </DialogDescription>
        </DialogHeader>
        <div className="p-5">
          <AuthPanel
            mode="dialog"
            onSuccess={onAuthenticated}
            callbackURL={callbackURL}
            onBeforeOidcRedirect={onBeforeOidcRedirect}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
