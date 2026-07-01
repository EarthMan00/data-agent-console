import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const REFRESH_COOKIE_NAME = "agent_platform.refresh_token";
export const HTTP_ONLY_REFRESH_TOKEN_PLACEHOLDER = "__http_only_refresh__";

function backendBaseUrl(): string {
  const raw =
    process.env.AGENT_WEB_PLATFORM_INTERNAL_URL?.trim() ||
    process.env.NEXT_PUBLIC_AGENT_API_ORIGIN?.trim() ||
    "http://127.0.0.1:8000";
  return raw.replace(/\/$/, "");
}

export function backendApiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${backendBaseUrl()}${p}`;
}

export async function readJsonSafe(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { _nonJsonBody: text };
  }
}

export function applyRefreshTokenCookie(response: NextResponse, refreshToken: string): void {
  response.cookies.set({
    name: REFRESH_COOKIE_NAME,
    value: refreshToken,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}

export function clearRefreshTokenCookie(response: NextResponse): void {
  response.cookies.set({
    name: REFRESH_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function getRefreshTokenFromCookie(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(REFRESH_COOKIE_NAME)?.value ?? null;
}
