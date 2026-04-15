import { redirect } from "next/navigation";

import { BFF_NEW_CHAT_PATH } from "@/core/bff-chat/ui";

export default function HomePage() {
  return redirect(BFF_NEW_CHAT_PATH);
}
