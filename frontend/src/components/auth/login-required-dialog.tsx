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
      <DialogContent className="sm:max-w-xl">
        <DialogHeader className="gap-2">
          <DialogTitle>{t.auth.loginRequiredTitle}</DialogTitle>
          <DialogDescription>
            {t.auth.loginRequiredDescription}
          </DialogDescription>
        </DialogHeader>
        <AuthPanel
          mode="dialog"
          onSuccess={onAuthenticated}
          callbackURL={callbackURL}
          onBeforeOidcRedirect={onBeforeOidcRedirect}
        />
      </DialogContent>
    </Dialog>
  );
}
