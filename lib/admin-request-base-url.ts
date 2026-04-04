import "server-only";

/** 管理后台表单重定向用的站点根 URL（与浏览器实际访问协议一致，避免局域网 HTTP 被误判为 https）。 */
export function getAdminRequestBaseUrl(request: Request) {
  const url = new URL(request.url);
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedProto) {
    return `${forwardedProto}://${host}`;
  }
  if (process.env.NODE_ENV !== "production") {
    const proto = url.protocol === "https:" ? "https" : "http";
    return `${proto}://${host}`;
  }
  const protocol =
    host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
  return `${protocol}://${host}`;
}
