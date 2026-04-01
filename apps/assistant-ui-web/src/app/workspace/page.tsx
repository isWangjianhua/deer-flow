"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { getCurrentUser } from "../../lib/auth";
import { listConversations } from "../../lib/conversations";

export default function WorkspacePage() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const user = await getCurrentUser();
      if (!user) {
        if (!cancelled) {
          router.replace("/login");
        }
        return;
      }

      const conversations = await listConversations();
      if (cancelled) {
        return;
      }

      const firstConversation = conversations[0];
      if (firstConversation) {
        router.replace(`/workspace/${firstConversation.conversation_id}`);
        return;
      }

      router.replace("/workspace/new");
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return <main>Loading...</main>;
}
