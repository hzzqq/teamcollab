"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/**
 * 内页错误边界（App Router）。
 *
 * 作用：单个页面组件抛异常时兜住，不让整棵客户端树白屏 —— 用户看到可读提示
 * 并能重试/返回，而不是面对一个空白页。
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 记录到控制台便于排查（生产环境可接 APM）
    console.error("[app] 页面渲染异常:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-danger/10 text-lg font-medium text-danger">
        !
      </div>
      <div className="space-y-1">
        <h2 className="text-lg font-medium text-fg">页面出错了</h2>
        <p className="max-w-md text-sm text-muted">
          这是一个意外错误，你的任务数据没有丢失。可以重试，或返回我的任务页。
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button onClick={() => reset()}>重试</Button>
        <Button variant="secondary" onClick={() => (window.location.href = "/me/tasks")}>
          返回我的任务
        </Button>
      </div>
    </div>
  );
}
