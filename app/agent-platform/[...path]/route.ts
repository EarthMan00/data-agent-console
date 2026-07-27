import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 将 /agent-platform/* 流式透传到本机 FastAPI，避免 next.config rewrites 缓冲 SSE。
 * 开发环境在 NEXT_PUBLIC_AGENT_API_USE_PROXY=1 时，浏览器请求同源 /agent-platform/... 会命中此 Route。
 */
const BACKEND_BASE = (
  process.env.AGENT_WEB_PLATFORM_INTERNAL_URL?.trim() || "http://127.0.0.1:8000"
).replace(/\/$/, "");

/** 生产环境勿将 INTERNAL 指到公网 /agent-platform（会与浏览器请求形成 IIS/Next 回环，返回 HTML 400「错误的请求」）。 */
function warnMisconfiguredBackendBase() {
  if (process.env.NODE_ENV !== "production") return;
  const raw = process.env.AGENT_WEB_PLATFORM_INTERNAL_URL?.trim();
  if (!raw) return;
  try {
    const u = new URL(raw.includes("://") ? raw : `http://${raw}`);
    const host = u.hostname.toLowerCase();
    const isLoopback = host === "localhost" || host === "127.0.0.1" || host.startsWith("10.") || host.startsWith("192.168.");
    if (!isLoopback && u.pathname.replace(/\/+$/, "").endsWith("/agent-platform")) {
      console.error(
        "[agent-platform proxy] AGENT_WEB_PLATFORM_INTERNAL_URL 指向公网 /agent-platform，易引发代理回环与 IIS 400。",
        "生产请改为本机后端，例如 http://127.0.0.1:8000（由 IIS 负责对外 /agent-platform 路径）。",
      );
    }
  } catch {
    /* ignore invalid URL at startup */
  }
}
warnMisconfiguredBackendBase();

function buildUpstreamUrl(request: NextRequest, pathSegments: string[]) {
  const base = new URL(`${BACKEND_BASE}/`);
  const basePath = base.pathname.replace(/\/+$/, "");
  const path = pathSegments.map(encodeURIComponent).join("/");
  base.pathname = `${basePath}/${path}`.replace(/\/{2,}/g, "/");
  const url = base;
  url.search = request.nextUrl.search;
  return url.toString();
}

function forwardRequestHeaders(request: NextRequest): Headers {
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");
  return headers;
}

function buildResponseHeaders(upstream: Response): Headers {
  const headers = new Headers(upstream.headers);
  const ct = headers.get("content-type") ?? "";
  if (ct.includes("text/event-stream")) {
    headers.set("Cache-Control", "no-cache, no-transform");
    headers.set("Connection", "keep-alive");
    headers.set("X-Accel-Buffering", "no");
  }
  return headers;
}

async function proxy(request: NextRequest, pathSegments: string[]) {
  const url = buildUpstreamUrl(request, pathSegments);
  const method = request.method.toUpperCase();
  const mayHaveBody = method !== "GET" && method !== "HEAD";

  const init: RequestInit = {
    method,
    headers: forwardRequestHeaders(request),
    cache: "no-store",
    redirect: "manual",
  };

  // 无 body 的 POST 不能把 request.body=null 交给 fetch，否则会触发
  // undici「expected non-null body source」；有 body 时缓冲为 ArrayBuffer 再转发。
  if (mayHaveBody) {
    const buf = await request.arrayBuffer();
    if (buf.byteLength > 0) {
      init.body = buf;
    }
  }

  let upstream: Response;
  try {
    upstream = await fetch(url, init);
  } catch (err) {
    console.error("[agent-platform proxy] upstream fetch failed:", method, url, err);
    return Response.json(
      {
        detail:
          `无法连接后端 ${BACKEND_BASE}。生产环境请将 AGENT_WEB_PLATFORM_INTERNAL_URL 设为本机 API ` +
          `(如 http://127.0.0.1:8000)，勿指向公网 http(s)://域名/agent-platform，否则会触发 IIS 400「错误的请求」。`,
      },
      { status: 502 },
    );
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: buildResponseHeaders(upstream),
  });
}

type RouteCtx = { params: Promise<{ path: string[] }> };

async function withPath(request: NextRequest, ctx: RouteCtx) {
  const { path } = await ctx.params;
  return proxy(request, path ?? []);
}

export async function GET(request: NextRequest, ctx: RouteCtx) {
  return withPath(request, ctx);
}

export async function POST(request: NextRequest, ctx: RouteCtx) {
  return withPath(request, ctx);
}

export async function PUT(request: NextRequest, ctx: RouteCtx) {
  return withPath(request, ctx);
}

export async function PATCH(request: NextRequest, ctx: RouteCtx) {
  return withPath(request, ctx);
}

export async function DELETE(request: NextRequest, ctx: RouteCtx) {
  return withPath(request, ctx);
}

export async function OPTIONS(request: NextRequest, ctx: RouteCtx) {
  return withPath(request, ctx);
}
