import type { NextConfig } from "next";

// 局域网 IP 访问 dev 时须把主机名加入列表，否则 HMR 等开发资源 403。见 .env.local：NEXT_DEV_ALLOWED_ORIGINS
const extraDevOrigins = (process.env.NEXT_DEV_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const agentInternal =
  process.env.AGENT_WEB_PLATFORM_INTERNAL_URL?.trim() || "http://127.0.0.1:8000";
const agentInternalBase = agentInternal.replace(/\/$/, "");

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost", ...extraDevOrigins],
  async rewrites() {
    return [
      {
        source: "/agent-platform/:path*",
        destination: `${agentInternalBase}/:path*`,
      },
    ];
  },
};

export default nextConfig;
