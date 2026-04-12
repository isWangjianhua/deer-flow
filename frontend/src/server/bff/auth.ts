import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  getBffLocalAuthCookieName,
  getLocalBffHeaderName,
  isLocalDevAuthMode,
} from "@/core/auth/local";

export function buildBearerHeaders(token: string, contentType?: string) {
  const headers = new Headers({
    Authorization: `Bearer ${token}`,
  });

  if (contentType) {
    headers.set("content-type", contentType);
  }

  return headers;
}

export async function requireBffAuth(request: NextRequest) {
  if (isLocalDevAuthMode()) {
    const localToken =
      request.headers.get(getLocalBffHeaderName()) ??
      request.cookies.get(getBffLocalAuthCookieName())?.value;

    if (!localToken) {
      return {
        error: NextResponse.json(
          { code: "unauthenticated", message: "Local dev sign in required" },
          { status: 401 },
        ),
      };
    }

    return { bearerToken: localToken };
  }

  const { getOidcAccount, getOidcIdTokenFromAccount, getSession } =
    await import("@/server/better-auth");
  const session = await getSession();
  if (!session?.session) {
    return {
      error: NextResponse.json(
        { code: "unauthenticated", message: "Sign in required" },
        { status: 401 },
      ),
    };
  }

  const account = await getOidcAccount(request);
  const idToken = getOidcIdTokenFromAccount(account);
  if (!idToken) {
    return {
      error: NextResponse.json(
        { code: "missing_oidc_token", message: "OIDC token unavailable" },
        { status: 401 },
      ),
    };
  }

  return { bearerToken: idToken };
}
