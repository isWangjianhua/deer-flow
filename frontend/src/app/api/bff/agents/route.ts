import type { NextRequest } from "next/server";

import { proxyAuthenticatedBffJson } from "@/server/bff/proxy";

export async function GET(request: NextRequest) {
  return proxyAuthenticatedBffJson(request, {
    path: "/agents",
  });
}

export async function POST(request: NextRequest) {
  return proxyAuthenticatedBffJson(request, {
    path: "/agents",
    method: "POST",
    contentType: request.headers.get("content-type") ?? undefined,
    body: await request.text(),
  });
}
