import "server-only";

import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

export const ADMIN_SESSION_COOKIE = "more_data_admin_session";

type AdminSessionPayload = {
  username: string;
  issuedAt: number;
};

function getAdminConfig() {
  return {
    username: process.env.ADMIN_USERNAME ?? "Admin",
    password: process.env.ADMIN_PASSWORD ?? "19981201",
    secret: process.env.ADMIN_SESSION_SECRET ?? "more-data-agent-admin-session",
  };
}

function encodePayload(payload: AdminSessionPayload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodePayload(value: string) {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as AdminSessionPayload;
}

function signValue(value: string) {
  return createHmac("sha256", getAdminConfig().secret).update(value).digest("hex");
}

export function verifyAdminCredentials(username: string, password: string) {
  const config = getAdminConfig();
  return username === config.username && password === config.password;
}

export function createAdminSessionValue() {
  const payload = encodePayload({
    username: getAdminConfig().username,
    issuedAt: Date.now(),
  });
  return `${payload}.${signValue(payload)}`;
}

export function verifyAdminSessionValue(value?: string | null) {
  if (!value) return false;

  const [payload, signature] = value.split(".");
  if (!payload || !signature) return false;

  const expectedSignature = signValue(payload);
  const provided = Buffer.from(signature, "utf8");
  const expected = Buffer.from(expectedSignature, "utf8");

  if (provided.length !== expected.length) {
    return false;
  }

  if (!timingSafeEqual(provided, expected)) {
    return false;
  }

  try {
    const decoded = decodePayload(payload);
    return decoded.username === getAdminConfig().username;
  } catch {
    return false;
  }
}

export async function isAdminAuthenticated() {
  const cookieStore = await cookies();
  return verifyAdminSessionValue(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
}
