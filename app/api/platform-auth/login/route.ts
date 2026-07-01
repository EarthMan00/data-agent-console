import { NextRequest, NextResponse } from "next/server";

import {
  HTTP_ONLY_REFRESH_TOKEN_PLACEHOLDER,
  applyRefreshTokenCookie,
  backendApiUrl,
  readJsonSafe,
} from "@/lib/server/platform-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.text();
  const upstream = await fetch(backendApiUrl("/api/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    cache: "no-store",
  });
  const data = await readJsonSafe(upstream);
  if (!upstream.ok) {
    return NextResponse.json(data, { status: upstream.status });
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return NextResponse.json({ detail: "invalid login response" }, { status: 502 });
  }
  const refreshToken = typeof (data as { refresh_token?: unknown }).refresh_token === "string"
    ? (data as { refresh_token: string }).refresh_token
    : "";
  if (!refreshToken) {
    return NextResponse.json({ detail: "missing refresh token from upstream login" }, { status: 502 });
  }
  const response = NextResponse.json(
    {
      ...(data as Record<string, unknown>),
      refresh_token: HTTP_ONLY_REFRESH_TOKEN_PLACEHOLDER,
    },
    { status: 200 },
  );
  applyRefreshTokenCookie(response, refreshToken);
  return response;
}
