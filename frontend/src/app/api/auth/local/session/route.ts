import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getBffLocalAuthCookieName, isLocalDevAuthMode, toLocalDevSession } from "@/core/auth/local";
import { getInternalBffBaseURL } from "@/server/bff/internal";

export async function GET() {
  if (!isLocalDevAuthMode()) {
    return NextResponse.json(
      { code: "disabled", message: "Local dev auth is disabled" },
      { status: 404 },
    );
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(getBffLocalAuthCookieName())?.value;

  if (!token) {
    return NextResponse.json(
      { code: "unauthenticated", message: "Local dev sign in required" },
      { status: 401 },
    );
  }

  const response = await fetch(`${getInternalBffBaseURL()}/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const payload = await response.json();

  if (!response.ok) {
    return NextResponse.json(
      { code: "unauthenticated", message: "Local dev sign in required" },
      { status: 401 },
    );
  }

  return NextResponse.json(toLocalDevSession(payload));
}
