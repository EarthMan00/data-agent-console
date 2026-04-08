import { NextResponse } from "next/server";

import { ADMIN_SESSION_COOKIE, createAdminSessionValue, verifyAdminCredentials } from "@/lib/admin-auth";
import { getAdminRequestBaseUrl } from "@/lib/admin-request-base-url";

export async function POST(request: Request) {
  const formData = await request.formData();
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  const nextPath = String(formData.get("next") ?? "/admin/feedback");
  const baseUrl = getAdminRequestBaseUrl(request);

  if (!verifyAdminCredentials(username, password)) {
    return NextResponse.redirect(new URL(`/admin/login?error=1&next=${encodeURIComponent(nextPath)}`, baseUrl));
  }

  const redirectBase = new URL(baseUrl);
  const secureCookie =
    redirectBase.protocol === "https:" ||
    process.env.ADMIN_COOKIE_SECURE?.trim() === "1";

  const response = NextResponse.redirect(
    new URL(nextPath.startsWith("/admin") ? nextPath : "/admin/feedback", baseUrl),
  );
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: createAdminSessionValue(),
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookie,
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
  return response;
}
