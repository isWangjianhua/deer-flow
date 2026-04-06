import { logout } from "./auth";

export async function performLogout(navigate: (href: string) => void): Promise<void> {
  await logout();
  navigate("/login");
}
