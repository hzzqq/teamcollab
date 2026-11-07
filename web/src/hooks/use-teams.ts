"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

/** 当前用户所属的全部团队及角色 */
export function useMyTeams() {
  // 局部 mounted 闸门：缓存命中时 CSR 首帧 isLoading 会直接变 false 而 SSR 恒为 true，
  // StateSwitch 会因此渲染内容 vs 骨架屏不一致（React #418）。挂载前强制 isLoading=true。
  // 必须用组件局部 useState(mounted)，不能复用跨组件的全局标志位（race 缺陷：useMe 既
  // 直接调用、又经本 hook 内部调用，全局标志位会让部分实例 state 永远停在 false）。
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const query = useQuery({
    queryKey: ["my-teams"],
    queryFn: () => api.meTeams(),
    staleTime: 5 * 60_000,
  });
  return { ...query, isLoading: mounted ? query.isLoading : true };
}

export { resolveActiveTeam, setActiveTeamId, readActiveTeamId } from "@/lib/active-team";
