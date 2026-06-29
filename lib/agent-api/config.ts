/**
 * 与 Alice 后端服务 联调（NEXT_PUBLIC_* 在构建时内联）。
 *
 * 局域网内其他设备访问时，勿把 API 指到 127.0.0.1（会指向访客本机）。
 * 可设 NEXT_PUBLIC_AGENT_API_USE_PROXY=1，HTTP 经 Next 同源路径 /agent-platform 转发到本机 8000。
 */

const AGENT_PLATFORM_PROXY_PREFIX = "/agent-platform";

export function isAgentRealApiEnabled(): boolean {
  return true;
}

/** 为 true 时，浏览器只请求当前页面的 origin + /agent-platform，由 next.config rewrites 转到后端。 */
export function isAgentApiProxyEnabled(): boolean {
  return (process.env.NEXT_PUBLIC_AGENT_API_USE_PROXY ?? "").trim() === "1";
}

export function getAgentApiOrigin(): string {
  if (isAgentApiProxyEnabled()) {
    if (typeof console !== "undefined") {
      console.warn(
        "已启用 NEXT_PUBLIC_AGENT_API_USE_PROXY，请使用 getAgentHttpApiBase() 拼接 API 地址；getAgentApiOrigin() 返回当前页面 origin 作为降级。",
      );
    }
    if (typeof window !== "undefined") {
      return window.location.origin.replace(/\/$/, "");
    }
    return "";
  }
  const v = process.env.NEXT_PUBLIC_AGENT_API_ORIGIN?.trim();
  if (!v) {
    throw new Error(
      "NEXT_PUBLIC_AGENT_API_ORIGIN is required unless NEXT_PUBLIC_AGENT_API_USE_PROXY=1",
    );
  }
  return v.replace(/\/$/, "");
}

/**
 * 浏览器侧 HTTP API 根路径（无尾部斜杠）：直连时为完整 origin，代理时为 `/agent-platform`。
 */
export function getAgentHttpApiBase(): string {
  if (isAgentApiProxyEnabled()) {
    return AGENT_PLATFORM_PROXY_PREFIX;
  }
  return getAgentApiOrigin();
}

export function getTaskNameMaxChars(): number {
  const raw = process.env.NEXT_PUBLIC_TASK_NAME_MAX_CHARS?.trim();
  const n = raw ? Number.parseInt(raw, 10) : 32;
  if (!Number.isFinite(n) || n < 1) return 32;
  return Math.min(n, 200);
}

export function getChatMessageMaxChars(): number {
  const raw = process.env.NEXT_PUBLIC_CHAT_MESSAGE_MAX_CHARS?.trim();
  const n = raw ? Number.parseInt(raw, 10) : 100_000;
  if (!Number.isFinite(n) || n < 1) return 100_000;
  return Math.min(n, 100_000);
}

export function getAgentWsOrigin(): string {
  if (isAgentApiProxyEnabled()) {
    const explicit = process.env.NEXT_PUBLIC_AGENT_WS_ORIGIN?.trim();
    if (explicit) {
      return explicit.replace(/\/$/, "");
    }
    const port = (process.env.NEXT_PUBLIC_AGENT_BACKEND_PORT ?? "8000").trim();
    if (typeof window !== "undefined" && typeof console !== "undefined") {
      console.warn(
        "代理模式下未设置 NEXT_PUBLIC_AGENT_WS_ORIGIN，WebSocket 将直连后端端口；生产环境请显式配置 WS 地址。",
      );
    }
    if (typeof window !== "undefined") {
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      return `${proto}://${window.location.hostname}:${port}`;
    }
    return `ws://127.0.0.1:${port}`;
  }

  const explicit = process.env.NEXT_PUBLIC_AGENT_WS_ORIGIN?.trim();
  if (explicit) {
    return explicit.replace(/\/$/, "");
  }
  const api = getAgentApiOrigin();
  if (api.startsWith("https://")) {
    return `wss://${api.slice(8)}`;
  }
  if (api.startsWith("http://")) {
    return `ws://${api.slice(7)}`;
  }
  throw new Error(`Invalid NEXT_PUBLIC_AGENT_API_ORIGIN: ${api}`);
}
