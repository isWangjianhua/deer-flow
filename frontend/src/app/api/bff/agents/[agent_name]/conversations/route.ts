import type { NextRequest } from "next/server";

import { proxyAuthenticatedBffJson } from "@/server/bff/proxy";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ agent_name: string }> },
) {
  const { agent_name: agentName } = await context.params;
  return proxyAuthenticatedBffJson(request, {
    path: `/agents/${agentName}/conversations`,
    method: "POST",
  });
}
