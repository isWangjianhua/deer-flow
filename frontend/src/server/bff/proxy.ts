import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { buildBearerHeaders, requireBffAuth } from "./auth";
import { getInternalBffBaseURL } from "./internal";

type ProxyAuthenticatedBffJsonInput = {
  path: string;
  method?: string;
  contentType?: string;
  body?: BodyInit | null;
};

export async function jsonProxyResponse(response: Response) {
  return new NextResponse(await response.text(), {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json",
    },
  });
}

export async function proxyAuthenticatedBffJson(
  request: NextRequest,
  input: ProxyAuthenticatedBffJsonInput,
) {
  const auth = await requireBffAuth(request);
  if ("error" in auth) {
    return auth.error;
  }

  const response = await fetch(`${getInternalBffBaseURL()}${input.path}`, {
    method: input.method,
    headers: buildBearerHeaders(auth.bearerToken, input.contentType),
    body: input.body ?? undefined,
  });

  return jsonProxyResponse(response);
}
