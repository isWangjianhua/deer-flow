"use client";

import { Button } from "@/components/ui/button";
import { signInWithOidc } from "@/core/auth/browser";

export function LoginButton() {
  return <Button onClick={() => void signInWithOidc()}>Sign in</Button>;
}
