import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";
import { Logo } from "@/components/shell/logo";

export const metadata: Metadata = { title: "登录 · TeamCollab" };

export default function LoginPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <Logo />
          <h1 className="text-2xl font-semibold text-fg">欢迎回来</h1>
          <p className="text-sm text-muted">登录以查看你的任务与团队动态</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-6 shadow-ring">
          <AuthForm mode="login" />
          <p className="mt-4 text-center text-xs text-muted">
            还没有账户？{" "}
            <a href="/register" className="text-primary-600 hover:underline">
              创建账户
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
