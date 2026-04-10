import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { buildBffMeRequest } from "@/core/auth/bff";
import { requireBffAuth } from "@/server/bff/auth";
import { getInternalBffBaseURL } from "@/server/bff/internal";

export async function GET(request: NextRequest) {
  const auth = await requireBffAuth(request);
  if ("error" in auth) {
    return auth.error;
  }

  const upstreamRequest = buildBffMeRequest({
    baseURL: getInternalBffBaseURL(),
    idToken: auth.bearerToken,
  });
  const response = await fetch(upstreamRequest.url, upstreamRequest.init);

  return new NextResponse(await response.text(), {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json",
    },
  });
}
