import { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

/**
 * 全局 TanStack Query 客户端（服务端状态缓存）。
 *
 * 注意：这是全局唯一实例的创建入口 —— app/(app)/layout.tsx 的 Providers 必须
 * 使用本函数创建 QueryClient。若另建 client，mutations.onError 的全局错误
 * toast 就不会注册，所有写操作失败会静默无提示（历史缺陷）。
 */
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
