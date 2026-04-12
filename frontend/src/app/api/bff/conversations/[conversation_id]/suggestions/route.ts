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
  const response = await fetch(
    `${getInternalBffBaseURL()}/conversations/${conversationId}/suggestions`,
    {
      method: "POST",
      headers: buildBearerHeaders(auth.bearerToken, "application/json"),
      body: await request.text(),
    },
  );

  return new NextResponse(await response.text(), {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json",
    },
  });
}
