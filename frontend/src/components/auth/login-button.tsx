"use client";

import { Button } from "@/components/ui/button";
import { getOidcProviderId } from "@/core/auth/config";
import { authClient } from "@/server/better-auth/client";

export function LoginButton() {
  return (
    <Button
      onClick={() =>
        authClient.signIn.oauth2({
          providerId: getOidcProviderId(),
          callbackURL: "/workspace/account",
        })
      }
    >
      Sign in
    </Button>
  );
}
