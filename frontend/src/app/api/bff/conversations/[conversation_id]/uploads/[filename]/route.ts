import type { NextRequest } from "next/server";

import { proxyAuthenticatedBffJson } from "@/server/bff/proxy";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ conversation_id: string; filename: string }> },
) {
  const { conversation_id: conversationId, filename } = await context.params;
  return proxyAuthenticatedBffJson(request, {
    path: `/conversations/${conversationId}/uploads/${filename}`,
    method: "DELETE",
  });
}
