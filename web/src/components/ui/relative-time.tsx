"use client";

import { useEffect, useState } from "react";
import { timeAgo } from "@/lib/format";

/**
 * SSR 安全的相对时间（消除 React #418 的一类成因）。
 *
 * `timeAgo()` 内部调用 `Date.now()`，服务端渲染与客户端 hydration 求值时刻不同，
 * 跨过「刚刚 / N 分钟前」边界时文本就对不上；`formatDateTime()` 还依赖 Intl 与
 * 本地时区，两端时区不一致同样会 mismatch。React 418 会把整棵树在客户端重建，
 * 浏览器 E2E 的 `no_page_runtime_errors` 会偶发翻红。
 *
 * 做法：首屏（SSR + CSR hydration）渲染由 iso **纯字符串**派生的稳定占位，
 * 两端结果必然一致；挂载后切换为相对时间并每 30 秒刷新一次。
 * 不用 `suppressHydrationWarning` —— 从结构上让首屏输出确定，而不是压掉警告。
 *
 * 注：这些时间点都来自客户端 API 数据，SSR 阶段通常不会渲染本组件；
 * 即便渲染，首屏占位也不会引入非确定性输入。
 */
function stableLabel(iso: string): string {
  // 只做字符串解析：不碰 Date / Intl / 时区 / Math.random
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(iso);
  return m ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}` : iso;
}

const REFRESH_MS = 30_000;

export function RelativeTime({
  iso,
  className,
}: {
  iso: string;
  className?: string;
}) {
  const [label, setLabel] = useState(() => stableLabel(iso));

  useEffect(() => {
    const tick = () => setLabel(timeAgo(iso));
    tick();
    const timer = window.setInterval(tick, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [iso]);

  return <span className={className}>{label}</span>;
}
