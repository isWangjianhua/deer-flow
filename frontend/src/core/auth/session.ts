import type { AuthSessionState } from "./types";

type BetterAuthSessionResult = {
  data:
    | {
        session?: { id: string };
        user: { id: string; email?: string | null; name?: string | null };
      }
    | null;
  isPending: boolean;
  error: { message?: string } | null;
};

export function toAuthSessionState(
  session: BetterAuthSessionResult,
): AuthSessionState {
  if (session.isPending) {
    return { status: "loading", user: null, errorMessage: null };
  }

  if (!session.data?.user) {
    return {
      status: "unauthenticated",
      user: null,
      errorMessage: session.error?.message ?? null,
    };
  }

  return {
    status: "authenticated",
    user: {
      id: session.data.user.id,
      email: session.data.user.email ?? null,
      name: session.data.user.name ?? null,
    },
    errorMessage: session.error?.message ?? null,
  };
}
