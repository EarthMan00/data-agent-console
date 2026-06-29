/** @type {import('next').NextConfig} */
// 局域网 IP 访问 dev 时须把主机名加入列表，否则 HMR 等开发资源 403。见 .env.local：NEXT_DEV_ALLOWED_ORIGINS
const extraDevOrigins = (process.env.NEXT_DEV_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const nextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost", ...extraDevOrigins],
  // Next.js 16 默认生产构建用 Turbopack；保留 webpack 仅用于 dev:webpack 的 client fallback
  turbopack: {},
  // SSE 须走 app/agent-platform/[...path]/route.ts 流式透传；rewrites 会缓冲整段响应导致无打字机效果。
  async rewrites() {
    return [];
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
