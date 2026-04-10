"use client";

import { Button } from "@/components/ui/button";
import { signOut } from "@/core/auth/browser";

export function LogoutButton() {
  return (
    <Button
      onClick={() => {
        void signOut().then(() => {
          window.location.reload();
        });
      }}
    >
      Sign out
    </Button>
  );
}
