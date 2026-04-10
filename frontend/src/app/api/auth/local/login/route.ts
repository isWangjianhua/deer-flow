import { NextResponse } from "next/server";

import { getBffLocalAuthCookieName, isLocalDevAuthMode, toLocalDevSession } from "@/core/auth/local";
import { getInternalBffBaseURL } from "@/server/bff/internal";

type LoginPayload = {
  username?: string;
  password?: string;
};

export async function POST(request: Request) {
  if (!isLocalDevAuthMode()) {
    return NextResponse.json(
      { code: "disabled", message: "Local dev auth is disabled" },
      { status: 404 },
    );
  }

  const payload = (await request.json()) as LoginPayload;
  const loginResponse = await fetch(`${getInternalBffBaseURL()}/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      username: payload.username ?? "",
      password: payload.password ?? "",
    }),
  });

  const loginText = await loginResponse.text();
  if (!loginResponse.ok) {
    return new NextResponse(loginText, {
      status: loginResponse.status,
      headers: {
        "content-type":
          loginResponse.headers.get("content-type") ?? "application/json",
      },
    });
  }

  const loginData = JSON.parse(loginText) as { access_token: string };
  const meResponse = await fetch(`${getInternalBffBaseURL()}/me`, {
    headers: {
      Authorization: `Bearer ${loginData.access_token}`,
    },
  });
  const mePayload = (await meResponse.json()) as {
    id?: string;
    username?: string;
    email?: string | null;
  };

  if (!meResponse.ok) {
    return NextResponse.json(
      { code: "local_auth_failed", message: "Failed to load BFF user" },
      { status: 502 },
    );
  }

  const session = toLocalDevSession(mePayload);
  const response = NextResponse.json({
    session,
    accessToken: loginData.access_token,
  });
  response.cookies.set({
    name: getBffLocalAuthCookieName(),
    value: loginData.access_token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });
  response.cookies.set({
    name: "deer-flow-local-auth-active",
    value: "1",
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });
  return response;
}
