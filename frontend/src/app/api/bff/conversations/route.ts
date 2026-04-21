import type { NextRequest } from "next/server";

import { proxyAuthenticatedBffJson } from "@/server/bff/proxy";

export async function GET(request: NextRequest) {
  return proxyAuthenticatedBffJson(request, {
    path: "/conversations",
  });
}

export async function POST(request: NextRequest) {
  return proxyAuthenticatedBffJson(request, {
    path: "/conversations",
    method: "POST",
  });
}
