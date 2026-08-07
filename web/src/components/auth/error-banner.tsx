"use client";

import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/** 登录/注册错误横幅：--danger 靠近表单（页面 1 Edge） */
export function ErrorBanner({ message, className }: { message: string | null; className?: string }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger",
        className,
      )}
    >
      <AlertCircle size={16} strokeWidth={1.5} className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
