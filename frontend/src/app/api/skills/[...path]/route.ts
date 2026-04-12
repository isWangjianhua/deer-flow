import type { NextRequest } from "next/server";

import { proxyGatewayRequest } from "@/app/api/_gateway/proxy";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return proxyGatewayRequest(request, `/api/skills/${(await params).path.join("/")}`);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return proxyGatewayRequest(request, `/api/skills/${(await params).path.join("/")}`);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return proxyGatewayRequest(request, `/api/skills/${(await params).path.join("/")}`);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return proxyGatewayRequest(request, `/api/skills/${(await params).path.join("/")}`);
}
