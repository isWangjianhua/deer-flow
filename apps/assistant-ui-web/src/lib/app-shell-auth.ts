import type { CurrentUser } from "./auth";

export function shouldShowUserControls(currentUser: CurrentUser | null | undefined) {
  return Boolean(currentUser?.username);
}
