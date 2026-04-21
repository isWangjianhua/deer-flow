import type { NextRequest } from "next/server";

import { proxyAuthenticatedBffJson } from "@/server/bff/proxy";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ conversation_id: string }> },
) {
  const { conversation_id: conversationId } = await context.params;
  return proxyAuthenticatedBffJson(request, {
    path: `/conversations/${conversationId}/suggestions`,
    method: "POST",
    contentType: "application/json",
    body: await request.text(),
  });
}
