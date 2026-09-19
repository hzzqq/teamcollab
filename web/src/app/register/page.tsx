import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";
import { Logo } from "@/components/shell/logo";

export const metadata: Metadata = { title: "注册 · TeamCollab" };

export default function RegisterPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <Logo />
          <h1 className="text-2xl font-semibold text-fg">创建你的团队空间</h1>
          <p className="text-sm text-muted">注册即创建默认团队，10 分钟上手任务协作</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-6 shadow-ring">
          <Suspense fallback={null}>
            <AuthForm mode="register" />
          </Suspense>
          <p className="mt-4 text-center text-xs text-muted">
            已有账户？{" "}
            <a href="/login" className="text-primary-600 hover:underline">
              直接登录
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
