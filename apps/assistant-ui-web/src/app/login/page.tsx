"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AuthDialog } from "../../components/auth-dialog";
import { getCurrentUser } from "../../lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [pending, setPending] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const user = await getCurrentUser();
        if (!cancelled && user) {
          router.replace("/workspace");
          return;
        }
      } catch {
        // Ignore bootstrap auth failures; the form remains usable.
      } finally {
        if (!cancelled) {
          setPending(false);
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (pending) {
    return <main className="flex min-h-screen items-center justify-center bg-[#111318] text-white">Loading...</main>;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,rgba(104,113,138,0.18),transparent_26%),linear-gradient(180deg,#0f1116_0%,#171a22_100%)] px-6 py-10">
      <AuthDialog
        onOpenChange={(open) => {
          if (!open) {
            router.replace("/workspace");
          }
        }}
        onSuccess={() => {
          router.replace("/workspace");
        }}
        open
      />
    </main>
  );
}
