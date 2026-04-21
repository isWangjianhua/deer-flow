import type { NextRequest } from "next/server";

import { proxyAuthenticatedBffJson } from "@/server/bff/proxy";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ conversation_id: string }> },
) {
  const { conversation_id: conversationId } = await context.params;
  return proxyAuthenticatedBffJson(request, {
    path: `/conversations/${conversationId}/uploads`,
  });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ conversation_id: string }> },
) {
  const { conversation_id: conversationId } = await context.params;
  const contentType = request.headers.get("content-type") ?? undefined;
  return proxyAuthenticatedBffJson(request, {
    path: `/conversations/${conversationId}/uploads`,
    method: "POST",
    contentType,
    body: await request.arrayBuffer(),
  });
}
