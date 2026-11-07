"use client";

import { useEffect, useState } from "react";

/**
 * 首屏水合（hydration）闸门。
 *
 * React #418 hydration mismatch 的系统性根因：数据 hook（useQuery）在 SSR 阶段永远
 * 拿不到数据（isLoading=true → 骨架屏），但同会话内前序页面若已拉过同一 queryKey，
 * 客户端缓存会在 CSR 首帧同步命中 → isLoading=false → 直接渲染内容，与 SSR HTML 的
 * 骨架屏结构不一致。
 *
 * 解决：在「首屏水合完成之前」强制 isLoading=true（骨架屏），与 SSR 对齐；挂载后
 * 再放开为真实值。关键在于用「全局唯一」标志位而非组件局部 useState：
 *   - 首屏水合：所有组件首帧一律 false → 与 SSR 一致；effect 跑过后全局置 true。
 *   - 之后任意客户端路由跳转：全局已是 true → 首帧即取真实缓存值，不会每次跳转都
 *     闪一下骨架屏（避免把「首屏确定性」错做成「每次跳转都退化成加载态」）。
 *
 * SSR 永远不跑 effect → 恒为 false，天然与客户端首帧对齐。
 */

let globalHydrated = false;

export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(globalHydrated);
  useEffect(() => {
    if (globalHydrated) return;
    globalHydrated = true;
    setHydrated(true);
  }, []);
  return hydrated;
}
