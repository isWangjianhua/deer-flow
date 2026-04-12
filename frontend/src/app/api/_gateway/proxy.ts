import type { NextRequest } from "next/server";

const GATEWAY_BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_BASE_URL ?? "http://127.0.0.1:8001";

function buildGatewayUrl(pathname: string, search: string) {
  const url = new URL(pathname, GATEWAY_BASE_URL);
  url.search = search;
  return url;
}

export async function proxyGatewayRequest(
  request: NextRequest,
  pathname: string,
) {
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");

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
