import type { NextRequest } from "next/server";

import { proxyAuthenticatedBffJson } from "@/server/bff/proxy";

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams.toString();

  return proxyAuthenticatedBffJson(request, {
    path: `/agents/check${search ? `?${search}` : ""}`,
  });
}
