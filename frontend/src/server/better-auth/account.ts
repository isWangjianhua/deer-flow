import type { NextRequest } from "next/server";

export type BetterAuthAccountPayload = {
  providerId?: string;
  idToken?: string | null;
};

function resolveOidcProviderId() {
  return (
    process.env.BETTER_AUTH_OIDC_PROVIDER_ID ??
    process.env.NEXT_PUBLIC_BETTER_AUTH_OIDC_PROVIDER_ID ??
    "oidc"
  );
}

export async function getOidcAccount(request: NextRequest) {
  const { auth } = await import("./config");
  const providerId = resolveOidcProviderId();
  const tokens = await auth.api.getAccessToken({
    headers: request.headers,
    body: { providerId },
  });

  if (!tokens) {
    return null;
  }

  return {
    providerId,
    idToken: tokens.idToken ?? null,
  } satisfies BetterAuthAccountPayload;
}

export function getOidcIdTokenFromAccount(
  account: BetterAuthAccountPayload | null | undefined,
) {
  if (
    !account?.providerId ||
    account.providerId !== resolveOidcProviderId() ||
    !account.idToken
  ) {
    return null;
  }

  return account.idToken;
}
