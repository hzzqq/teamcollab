import { cn } from "@/lib/utils";

/** 品牌标识（登录/注册页 + 侧栏 logo 复用） */
export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex size-9 items-center justify-center rounded-md bg-primary-600 text-base font-semibold text-white",
        className,
      )}
      aria-hidden
    >
      T
    </span>
  );
}
