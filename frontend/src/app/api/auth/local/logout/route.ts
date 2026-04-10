import { NextResponse } from "next/server";

import { getBffLocalAuthCookieName, isLocalDevAuthMode } from "@/core/auth/local";

export async function POST() {
  if (!isLocalDevAuthMode()) {
    return NextResponse.json(
      { code: "disabled", message: "Local dev auth is disabled" },
      { status: 404 },
    );
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: getBffLocalAuthCookieName(),
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  response.cookies.set({
    name: "deer-flow-local-auth-active",
    value: "",
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
