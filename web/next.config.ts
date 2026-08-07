import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // FastAPI 默认 http://localhost:8000；通过 NEXT_PUBLIC_API_BASE 覆盖
  // 开发代理：避免 CORS 干扰
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];
    const apiBase = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";
    return [
      { source: "/api/:path*", destination: `${apiBase}/api/:path*` },
      { source: "/notifications/stream", destination: `${apiBase}/api/v1/notifications/stream` },
    ];
  },
};

export default nextConfig;
