import { NextResponse } from "next/server";

import {
  HTTP_ONLY_REFRESH_TOKEN_PLACEHOLDER,
  applyRefreshTokenCookie,
  backendApiUrl,
  clearRefreshTokenCookie,
  getRefreshTokenFromCookie,
  readJsonSafe,
} from "@/lib/server/platform-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const refreshToken = await getRefreshTokenFromCookie();
  if (!refreshToken) {
    return NextResponse.json({ detail: "missing refresh token cookie" }, { status: 401 });
  }
  const upstream = await fetch(backendApiUrl("/api/auth/refresh"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
    cache: "no-store",
  });
  const data = await readJsonSafe(upstream);
  if (!upstream.ok) {
    const response = NextResponse.json(data, { status: upstream.status });
    if (upstream.status === 401) {
      clearRefreshTokenCookie(response);
    }
    return response;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return NextResponse.json({ detail: "invalid refresh response" }, { status: 502 });
  }
  const nextRefreshToken = typeof (data as { refresh_token?: unknown }).refresh_token === "string"
    ? (data as { refresh_token: string }).refresh_token
    : "";
  if (!nextRefreshToken) {
    return NextResponse.json({ detail: "missing refresh token from upstream refresh" }, { status: 502 });
  }
  const response = NextResponse.json(
    {
      ...(data as Record<string, unknown>),
      refresh_token: HTTP_ONLY_REFRESH_TOKEN_PLACEHOLDER,
    },
    { status: 200 },
  );
  applyRefreshTokenCookie(response, nextRefreshToken);
  return response;
}
