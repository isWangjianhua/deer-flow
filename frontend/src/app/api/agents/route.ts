import type { NextRequest } from "next/server";

import { proxyGatewayRequest } from "@/app/api/_gateway/proxy";

export async function GET(request: NextRequest) {
  return proxyGatewayRequest(request, "/api/agents");
}

export async function POST(request: NextRequest) {
  return proxyGatewayRequest(request, "/api/agents");
}
