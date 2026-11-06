"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

/** 全局搜索：空关键词不发请求（命令面板刚打开时尤其重要）。 */
export function useSearch(q: string, enabled = true) {
  const query = q.trim();
  return useQuery({
    queryKey: ["global-search", query],
    queryFn: () => api.search(query),
    enabled: enabled && query.length > 0,
    staleTime: 15_000,
  });
}
