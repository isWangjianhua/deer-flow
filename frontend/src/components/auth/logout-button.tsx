"use client";

import { Button } from "@/components/ui/button";
import { authClient } from "@/server/better-auth/client";

export function LogoutButton() {
  return <Button onClick={() => authClient.signOut()}>Sign out</Button>;
}
