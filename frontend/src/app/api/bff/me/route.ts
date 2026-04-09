import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { buildBffMeRequest } from "@/core/auth/bff";
import {
  getOidcAccount,
  getOidcIdTokenFromAccount,
  getSession,
} from "@/server/better-auth";
import { getInternalBffBaseURL } from "@/server/bff/internal";

export async function GET(request: NextRequest) {
  const session = await getSession();

  if (!session?.session) {
    return NextResponse.json(
      { code: "unauthenticated", message: "Sign in required" },
      { status: 401 },
    );
  }

  const account = await getOidcAccount(request);
  const idToken = getOidcIdTokenFromAccount(account);

  if (!idToken) {
    return NextResponse.json(
      { code: "missing_oidc_token", message: "OIDC token unavailable" },
      { status: 401 },
    );
  }

  const upstreamRequest = buildBffMeRequest({
    baseURL: getInternalBffBaseURL(),
    idToken,
  });
  const response = await fetch(upstreamRequest.url, upstreamRequest.init);

  return new NextResponse(await response.text(), {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json",
    },
  });
}
