import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { buildBearerHeaders, requireBffAuth } from "@/server/bff/auth";
import { getInternalBffBaseURL } from "@/server/bff/internal";

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
      headers: buildBearerHeaders(auth.bearerToken, "application/json"),
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
