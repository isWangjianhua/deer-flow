import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  getOidcAccount,
  getOidcIdTokenFromAccount,
  getSession,
} from "@/server/better-auth";
import { getInternalBffBaseURL } from "@/server/bff/internal";

function buildAuthHeaders(idToken: string) {
  return new Headers({
    Authorization: `Bearer ${idToken}`,
    "content-type": "application/json",
  });
}

async function requireBffAuth(request: NextRequest) {
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

  return { idToken };
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ conversation_id: string }> },
) {
  const auth = await requireBffAuth(request);
  if ("error" in auth) {
    return auth.error;
  }

  const { conversation_id: conversationId } = await context.params;
  const body = await request.text();
  const response = await fetch(
    `${getInternalBffBaseURL()}/conversations/${conversationId}/messages/stream`,
    {
      method: "POST",
      headers: buildAuthHeaders(auth.idToken),
      body,
    },
  );

  return new NextResponse(response.body, {
    status: response.status,
    headers: {
      "content-type":
        response.headers.get("content-type") ?? "text/event-stream",
      "cache-control": "no-cache, no-transform",
    },
  });
}
