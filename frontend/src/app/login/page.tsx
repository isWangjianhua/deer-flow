import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import LoginScreen from "./screen";

export default async function LoginPage() {
  const cookieStore = await cookies();
  if (cookieStore.get("deerflow_session")?.value) {
    redirect("/workspace/chats/new");
  }

  return <LoginScreen />;
}
