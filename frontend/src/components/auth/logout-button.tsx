"use client";

import type { VariantProps } from "class-variance-authority";

import { Button } from "@/components/ui/button";
import type { buttonVariants } from "@/components/ui/button";
import { signOut } from "@/core/auth/browser";

export function LogoutButton({
  className,
  variant = "default",
  size = "default",
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    className?: string;
  }) {
  return (
    <Button
      type="button"
      {...props}
      className={className}
      size={size}
      variant={variant}
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
