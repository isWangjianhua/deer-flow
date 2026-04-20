import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { buildBearerHeaders, requireBffAuth } from "@/server/bff/auth";
import { getInternalBffBaseURL } from "@/server/bff/internal";

async function proxyJsonResponse(response: Response) {
  return new NextResponse(await response.text(), {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json",
    },
  });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ conversation_id: string }> },
) {
  const auth = await requireBffAuth(request);
  if ("error" in auth) {
    return auth.error;
  }

  const { conversation_id: conversationId } = await context.params;
  const response = await fetch(
    `${getInternalBffBaseURL()}/conversations/${conversationId}`,
    {
      headers: buildBearerHeaders(auth.bearerToken),
    },
  );

  return proxyJsonResponse(response);
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ conversation_id: string }> },
) {
  const auth = await requireBffAuth(request);
  if ("error" in auth) {
    return auth.error;
  }

  const { conversation_id: conversationId } = await context.params;
  const response = await fetch(
    `${getInternalBffBaseURL()}/conversations/${conversationId}`,
    {
      method: "PATCH",
      headers: buildBearerHeaders(auth.bearerToken, "application/json"),
      body: await request.text(),
    },
  );

  return proxyJsonResponse(response);
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ conversation_id: string }> },
) {
  const auth = await requireBffAuth(request);
  if ("error" in auth) {
    return auth.error;
  }

  const { conversation_id: conversationId } = await context.params;
  const response = await fetch(
    `${getInternalBffBaseURL()}/conversations/${conversationId}`,
    {
      method: "DELETE",
      headers: buildBearerHeaders(auth.bearerToken),
    },
  );

  return proxyJsonResponse(response);
}
