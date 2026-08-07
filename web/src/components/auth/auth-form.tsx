"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorBanner } from "./error-banner";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string; name?: string }>({});

  const validate = (): boolean => {
    const errs: typeof fieldErrors = {};
    if (!EMAIL_RE.test(email)) errs.email = "请输入有效的邮箱地址";
    if (mode === "register") {
      if (password.length < 8) errs.password = "密码至少 8 位";
      if (!displayName.trim()) errs.name = "请填写显示名";
    } else if (!password) {
      errs.password = "请输入密码";
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    if (!validate()) return;
    setLoading(true);
    try {
      if (mode === "login") {
        await api.login(email.trim(), password);
      } else {
        await api.register({ email: email.trim(), password, display_name: displayName.trim() });
      }
      router.replace("/me/tasks");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 40901) setError("该邮箱已被注册，请直接登录");
        else if (err.code === 40101) setError("邮箱或密码错误");
        else setError(err.message);
      } else {
        setError("网络连接失败，请稍后再试");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <ErrorBanner message={error} />

      {mode === "register" ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="display-name">显示名</Label>
          <Input
            id="display-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="同事如何称呼你"
            autoComplete="name"
            aria-invalid={Boolean(fieldErrors.name)}
            disabled={loading}
          />
          {fieldErrors.name ? <p className="text-xs text-danger">{fieldErrors.name}</p> : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">邮箱</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          autoComplete="email"
          aria-invalid={Boolean(fieldErrors.email)}
          disabled={loading}
        />
        {fieldErrors.email ? <p className="text-xs text-danger">{fieldErrors.email}</p> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">密码</Label>
          {mode === "login" ? (
            <button
              type="button"
              disabled
              className="text-xs text-meta disabled:cursor-not-allowed"
              title="MVP 暂不支持找回密码"
            >
              忘记密码
            </button>
          ) : null}
        </div>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === "register" ? "至少 8 位" : "输入密码"}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            aria-invalid={Boolean(fieldErrors.password)}
            disabled={loading}
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "隐藏密码" : "显示密码"}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-meta transition-colors duration-fast hover:text-fg-2 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)] rounded-sm"
          >
            {showPassword ? <EyeOff size={16} strokeWidth={1.5} /> : <Eye size={16} strokeWidth={1.5} />}
          </button>
        </div>
        {fieldErrors.password ? <p className="text-xs text-danger">{fieldErrors.password}</p> : null}
      </div>

      <Button type="submit" disabled={loading} className="mt-2 w-full">
        {loading ? (
          <>
            <Loader2 size={16} strokeWidth={1.5} className="animate-spin" />
            {mode === "login" ? "登录中" : "注册中"}
          </>
        ) : mode === "login" ? (
          "登录"
        ) : (
          "创建账户"
        )}
      </Button>
    </form>
  );
}
