"use client";

import { RefreshCw, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

/* DESIGN.md §4.6 空状态：Lucide 24px 图标 + 具体可行动文案 + 主 CTA */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 px-6 py-12 text-center", className)}>
      <div className="flex size-12 items-center justify-center rounded-full bg-surface-warm text-muted">
        <Icon size={24} strokeWidth={1.5} />
      </div>
      <p className="text-sm font-medium text-fg">{title}</p>
      {description ? <p className="max-w-xs text-xs text-muted">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/* DESIGN.md §4.6 错误态：具体错误信息 + 重试 */
export function ErrorState({
  message = "加载失败，点击重试",
  onRetry,
  className,
}: {
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 px-6 py-12 text-center", className)}>
      <div className="flex size-12 items-center justify-center rounded-full bg-danger/10 text-danger">
        <RefreshCw size={24} strokeWidth={1.5} />
      </div>
      <p className="text-sm text-fg">{message}</p>
      {onRetry ? (
        <Button variant="secondary" size="sm" className="mt-2" onClick={onRetry}>
          <RefreshCw size={16} strokeWidth={1.5} />
          重试
        </Button>
      ) : null}
    </div>
  );
}

/* DESIGN.md §4.6 加载态：骨架屏 */
export function SkeletonRows({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

/* 页面级通用状态切换器：isLoading / isError / isEmpty / children */
export function StateSwitch({
  isLoading,
  isError,
  errorMessage,
  isEmpty,
  onRetry,
  skeleton,
  empty,
  children,
}: {
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  isEmpty?: boolean;
  onRetry?: () => void;
  skeleton?: React.ReactNode;
  empty?: React.ReactNode;
  children: React.ReactNode;
}) {
  if (isLoading) return <>{skeleton ?? <SkeletonRows />}</>;
  if (isError) return <ErrorState message={errorMessage} onRetry={onRetry} />;
  if (isEmpty) return <>{empty}</>;
  return <>{children}</>;
}
