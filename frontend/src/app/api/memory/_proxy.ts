import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { buildBffMeRequest } from "@/core/auth/bff";
import { requireBffAuth } from "@/server/bff/auth";
import { getInternalBffBaseURL } from "@/server/bff/internal";

const GATEWAY_BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_BASE_URL ?? "http://127.0.0.1:8001";

type BffMePayload = {
  id?: string;
  message?: string;
};

function buildGatewayUrl(pathname: string, search: string) {
  const url = new URL(pathname, GATEWAY_BASE_URL);
  url.search = search;
  return url;
}

export async function proxyMemoryRequest(
  request: NextRequest,
  pathname: string,
) {
  const auth = await requireBffAuth(request);
  if ("error" in auth) {
    return auth.error;
  }

  const meRequest = buildBffMeRequest({
    baseURL: getInternalBffBaseURL(),
    idToken: auth.bearerToken,
  });
  const meResponse = await fetch(meRequest.url, meRequest.init);
  const mePayload = (await meResponse.json().catch(() => ({}))) as BffMePayload;

  if (!meResponse.ok || !mePayload.id) {
    return NextResponse.json(
      {
        code: "unauthenticated",
        message: mePayload.message ?? "Authenticated BFF user required",
      },
      { status: 401 },
    );
  }

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");
  headers.set("X-User-Id", mePayload.id);

  const hasBody = !["GET", "HEAD"].includes(request.method);
  const response = await fetch(
    buildGatewayUrl(pathname, request.nextUrl.search),
    {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
    },
  );

  return new Response(await response.arrayBuffer(), {
    status: response.status,
    headers: response.headers,
  });
}
