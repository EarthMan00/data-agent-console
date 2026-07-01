import { NextRequest, NextResponse } from "next/server";

import {
  backendApiUrl,
  clearRefreshTokenCookie,
  getRefreshTokenFromCookie,
  readJsonSafe,
} from "@/lib/server/platform-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const refreshToken = await getRefreshTokenFromCookie();
  const headers: HeadersInit = { "Content-Type": "application/json" };
  const auth = request.headers.get("authorization");
  if (auth) {
    headers.Authorization = auth;
  }
  const upstream = await fetch(backendApiUrl("/api/auth/logout"), {
    method: "POST",
    headers,
    body: JSON.stringify({ refresh_token: refreshToken }),
    cache: "no-store",
  });
  const data = await readJsonSafe(upstream);
  const response = NextResponse.json(
    upstream.ok ? { ok: true } : (data as Record<string, unknown> | null) ?? { detail: "logout failed" },
    { status: upstream.ok ? 200 : upstream.status },
  );
  clearRefreshTokenCookie(response);
  return response;
}
