import type { NextRequest } from "next/server";

import { proxyAuthenticatedBffJson } from "@/server/bff/proxy";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ conversation_id: string }> },
) {
  const { conversation_id: conversationId } = await context.params;
  return proxyAuthenticatedBffJson(request, {
    path: `/conversations/${conversationId}`,
  });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ conversation_id: string }> },
) {
  const { conversation_id: conversationId } = await context.params;
  return proxyAuthenticatedBffJson(request, {
    path: `/conversations/${conversationId}`,
    method: "PATCH",
    contentType: "application/json",
    body: await request.text(),
  });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ conversation_id: string }> },
) {
  const { conversation_id: conversationId } = await context.params;
  return proxyAuthenticatedBffJson(request, {
    path: `/conversations/${conversationId}`,
    method: "DELETE",
  });
}
