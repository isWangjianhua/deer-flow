import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { buildBearerHeaders, requireBffAuth } from "@/server/bff/auth";
import { getInternalBffBaseURL } from "@/server/bff/internal";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ conversation_id: string; path: string[] }> },
) {
  const auth = await requireBffAuth(request);
  if ("error" in auth) {
    return auth.error;
  }

  const { conversation_id: conversationId, path } = await context.params;
  const artifactPath = path.join("/");
  const response = await fetch(
    `${getInternalBffBaseURL()}/conversations/${conversationId}/artifacts/${artifactPath}${request.nextUrl.search}`,
    {
      headers: buildBearerHeaders(auth.bearerToken),
    },
  );

  const headers = new Headers();
  for (const header of ["content-type", "content-disposition", "cache-control"]) {
    const value = response.headers.get(header);
    if (value) {
      headers.set(header, value);
    }
  }

  return new NextResponse(await response.arrayBuffer(), {
    status: response.status,
    headers,
  });
}
