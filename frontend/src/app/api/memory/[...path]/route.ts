import type { NextRequest } from "next/server";

import { proxyMemoryRequest } from "@/app/api/memory/_proxy";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return proxyMemoryRequest(request, `/api/memory/${(await params).path.join("/")}`);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return proxyMemoryRequest(request, `/api/memory/${(await params).path.join("/")}`);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return proxyMemoryRequest(request, `/api/memory/${(await params).path.join("/")}`);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return proxyMemoryRequest(request, `/api/memory/${(await params).path.join("/")}`);
}
