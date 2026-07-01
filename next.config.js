/** @type {import('next').NextConfig} */
const extraDevOrigins = (process.env.NEXT_DEV_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function normalizeOrigin(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

function buildConnectSrc() {
  const origins = new Set(["'self'"]);
  [
    process.env.NEXT_PUBLIC_AGENT_API_ORIGIN,
    process.env.NEXT_PUBLIC_AGENT_WS_ORIGIN,
  ]
    .map(normalizeOrigin)
    .filter(Boolean)
    .forEach((origin) => origins.add(origin));
  return Array.from(origins).join(" ");
}

function buildSecurityHeaders() {
  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    `connect-src ${buildConnectSrc()}`,
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' 'unsafe-inline'",
    "worker-src 'self' blob:",
    "frame-src 'self' blob:",
  ].join("; ");

  const headers = [
    { key: "Content-Security-Policy", value: csp },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
    },
  ];

  if (process.env.NODE_ENV === "production") {
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=31536000; includeSubDomains",
    });
  }

  return headers;
}

const nextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost", ...extraDevOrigins],
  turbopack: {},
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
  async headers() {
    return [
      {
        source: "/:path*",
        headers: buildSecurityHeaders(),
      },
    ];
  },
};

module.exports = nextConfig;
