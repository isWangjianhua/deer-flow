export type AuthUser = {
  id: string;
  email?: string | null;
  name?: string | null;
};

export type AuthSessionState = {
  status: "loading" | "authenticated" | "unauthenticated";
  user: AuthUser | null;
  errorMessage: string | null;
};
