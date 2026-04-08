import "server-only";

import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

export const ADMIN_SESSION_COOKIE = "more_data_admin_session";

type AdminSessionPayload = {
  username: string;
  issuedAt: number;
};

function getAdminConfig() {
  const username = process.env.ADMIN_USERNAME?.trim();
  const password = process.env.ADMIN_PASSWORD?.trim();
  const secret = process.env.ADMIN_SESSION_SECRET?.trim();
  if (!username || !password || !secret) {
    throw new Error(
      "管理后台缺少环境变量：必须设置 ADMIN_USERNAME、ADMIN_PASSWORD、ADMIN_SESSION_SECRET（不得使用代码内默认值）。",
    );
  }
  return { username, password, secret };
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
  const config = getAdminConfig();
  const payload = encodePayload({
    username: config.username,
    issuedAt: Date.now(),
  });
  return `${payload}.${signValue(payload)}`;
}

export function verifyAdminSessionValue(value?: string | null) {
  if (!value) return false;

  const [payload, signature] = value.split(".");
  if (!payload || !signature) return false;

  let config: ReturnType<typeof getAdminConfig>;
  try {
    config = getAdminConfig();
  } catch {
    return false;
  }

  const expectedSignature = createHmac("sha256", config.secret).update(payload).digest("hex");
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
    if (decoded.username !== config.username) return false;
    const maxAgeSec = Math.max(
      60,
      Math.min(
        parseInt(process.env.ADMIN_SESSION_MAX_AGE_SECONDS ?? "", 10) || 60 * 60 * 24 * 14,
        60 * 60 * 24 * 365,
      ),
    );
    const issued = typeof decoded.issuedAt === "number" ? decoded.issuedAt : 0;
    if (!issued || Number.isNaN(issued)) return false;
    if (Date.now() - issued > maxAgeSec * 1000) return false;
    return true;
  } catch {
    return false;
  }
}

export async function isAdminAuthenticated() {
  const cookieStore = await cookies();
  return verifyAdminSessionValue(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
}
