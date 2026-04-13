type StoredBrowserSessionLike = {
  session?: { id: string };
  user: { id: string; email?: string | null; name?: string | null };
} | null;

type StoredBrowserAuthSession = {
  data: StoredBrowserSessionLike;
  isPending: boolean;
  error: null;
};

export function resolveStoredBrowserAuthSession({
  hydrated,
  session,
}: {
  hydrated: boolean;
  session: StoredBrowserSessionLike;
}): StoredBrowserAuthSession {
  if (!hydrated) {
    return {
      data: null,
      isPending: true,
      error: null,
    };
  }

  return {
    data: session,
    isPending: false,
    error: null,
  };
}
