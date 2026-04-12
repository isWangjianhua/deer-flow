import { NextResponse } from "next/server";

import { getInternalBffBaseURL } from "@/server/bff/internal";

export async function GET() {
  const response = await fetch(`${getInternalBffBaseURL()}/models`);

  return new NextResponse(await response.text(), {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json",
    },
  });
}
