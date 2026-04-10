import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { buildBearerHeaders, requireBffAuth } from "@/server/bff/auth";
import { getInternalBffBaseURL } from "@/server/bff/internal";

export async function GET(request: NextRequest) {
  const auth = await requireBffAuth(request);
  if ("error" in auth) {
    return auth.error;
  }

  const response = await fetch(`${getInternalBffBaseURL()}/conversations`, {
    headers: buildBearerHeaders(auth.bearerToken),
  });

  return new NextResponse(await response.text(), {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json",
    },
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireBffAuth(request);
  if ("error" in auth) {
    return auth.error;
  }

  const response = await fetch(`${getInternalBffBaseURL()}/conversations`, {
    method: "POST",
    headers: buildBearerHeaders(auth.bearerToken),
  });

  return new NextResponse(await response.text(), {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json",
    },
  });
}
