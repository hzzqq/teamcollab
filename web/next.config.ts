import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Docker 镜像用 standalone 产物（.next/standalone 自带精简 node_modules）
  output: "standalone",
  // FastAPI 默认 http://localhost:8000；通过 NEXT_PUBLIC_API_BASE 覆盖
  // 开发代理：避免 CORS 干扰
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];
    // DEV_API_PROXY 只在服务端生效（无 NEXT_PUBLIC_ 前缀，不会打进客户端包）。
    // CI 的 hydration-probe 用它把 rewrite 明确指向 127.0.0.1，避免 localhost 解析到 ::1；
    // 本地不设置时行为与原来完全一致。
    const apiBase =
      process.env.DEV_API_PROXY || process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";
    return [
      { source: "/api/:path*", destination: `${apiBase}/api/:path*` },
      { source: "/notifications/stream", destination: `${apiBase}/api/v1/notifications/stream` },
    ];
  },
};

export default nextConfig;
