import type { NextRequest } from "next/server";

import { proxyAuthenticatedBffJson } from "@/server/bff/proxy";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ agent_name: string }> },
) {
  const { agent_name: agentName } = await context.params;
  return proxyAuthenticatedBffJson(request, {
    path: `/agents/${agentName}`,
  });
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ agent_name: string }> },
) {
  const { agent_name: agentName } = await context.params;
  return proxyAuthenticatedBffJson(request, {
    path: `/agents/${agentName}`,
    method: "PUT",
    contentType: request.headers.get("content-type") ?? undefined,
    body: await request.text(),
  });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ agent_name: string }> },
) {
  const { agent_name: agentName } = await context.params;
  return proxyAuthenticatedBffJson(request, {
    path: `/agents/${agentName}`,
    method: "DELETE",
  });
}
