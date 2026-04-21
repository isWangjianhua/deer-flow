import type { NextRequest } from "next/server";

import { proxyMemoryRequest } from "@/app/api/memory/_proxy";

export async function GET(request: NextRequest) {
  return proxyMemoryRequest(request, "/api/memory");
}

export async function DELETE(request: NextRequest) {
  return proxyMemoryRequest(request, "/api/memory");
}
