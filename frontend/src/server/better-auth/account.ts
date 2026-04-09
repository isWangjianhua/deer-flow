export type BetterAuthAccountPayload = {
  providerId?: string;
  idToken?: string | null;
};

export function getOidcIdTokenFromAccount(
  account: BetterAuthAccountPayload | null | undefined,
) {
  if (!account?.providerId || !account.idToken) {
    return null;
  }

  return account.idToken;
}
