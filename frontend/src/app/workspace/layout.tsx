import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import WorkspaceShell from "./workspace-shell";

export default async function WorkspaceLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  if (!cookieStore.get("deerflow_session")?.value) {
    redirect("/login");
  }
  return <WorkspaceShell>{children}</WorkspaceShell>;
}
