import "server-only";

function parseAllowedHosts(): string[] {
  const raw = process.env.ADMIN_ALLOWED_HOSTS?.trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function hostAllowed(hostname: string): boolean {
  const allowed = parseAllowedHosts();
  if (allowed.length === 0) return true;
  const h = hostname.split(":")[0]?.toLowerCase() ?? "";
  return allowed.some((a) => h === a || h.endsWith(`.${a}`));
}

/**
 * 管理后台表单重定向用的站点根 URL。
 * 默认只信任当前请求的 URL（不读取 X-Forwarded-*），避免客户端伪造转发头；
 * 设 ADMIN_TRUST_FORWARD_HEADERS=1 且部署在可信反向代理后时再启用转发头。
 */
export function getAdminRequestBaseUrl(request: Request) {
  const url = new URL(request.url);
  let host = url.host;
  let proto = url.protocol.replace(":", "");

  const trust = process.env.ADMIN_TRUST_FORWARD_HEADERS?.trim() === "1";
  if (trust) {
    const fh = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const fp = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim()?.toLowerCase();
    if (fh) host = fh;
    if (fp === "http" || fp === "https") proto = fp;
  }

  const explicit = process.env.ADMIN_PUBLIC_BASE_URL?.trim().replace(/\/$/, "");
  if (explicit) {
    return explicit;
  }

  const hostname = (host.split(":")[0] ?? host).toLowerCase();
  if (!hostAllowed(hostname)) {
    throw new Error(
      `admin: 主机名不在 ADMIN_ALLOWED_HOSTS 允许列表中: ${hostname}`,
    );
  }

  return `${proto}://${host}`;
}
