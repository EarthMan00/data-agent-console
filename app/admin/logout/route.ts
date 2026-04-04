import { NextResponse } from "next/server";

import { ADMIN_SESSION_COOKIE } from "@/lib/admin-auth";
import { getAdminRequestBaseUrl } from "@/lib/admin-request-base-url";

export async function POST(request: Request) {
  const baseUrl = getAdminRequestBaseUrl(request);
  const response = NextResponse.redirect(new URL("/admin/login", baseUrl));
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: "",
    path: "/",
    maxAge: 0,
  });
  return response;
}
