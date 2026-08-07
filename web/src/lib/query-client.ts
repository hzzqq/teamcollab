import { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

/** 全局 TanStack Query 客户端（服务端状态缓存） */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: 0,
        onError: (error) => {
          const message = error instanceof Error ? error.message : "操作失败，请重试";
          toast.error(message);
        },
      },
    },
  });
}
