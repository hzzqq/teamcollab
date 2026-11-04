"use client";

import { useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { makeQueryClient } from "@/lib/query-client";

/** 全局 Provider：QueryClient + 轻提示（sonner）；主题在 <html data-theme> 上由 useTheme 控制 */
export function Providers({ children }: { children: React.ReactNode }) {
  // 必须用 makeQueryClient：全局 mutation 错误 toast 注册在其中的 defaultOptions。
  // 另建 QueryClient 会导致所有写操作失败时静默无提示。
  const [client] = useState(makeQueryClient);

  return (
    <QueryClientProvider client={client}>
      {children}
      <Toaster />
    </QueryClientProvider>
  );
}
