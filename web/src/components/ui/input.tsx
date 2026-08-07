import * as React from "react";
import { cn } from "@/lib/utils";

/* DESIGN.md §4.2 输入框：default/focus/error/disabled 四态 */
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-md border border-border bg-surface px-3 py-1 text-sm text-fg shadow-none transition-colors duration-fast ease-standard file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-meta focus-visible:border-primary-500 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:bg-surface-warm disabled:text-meta aria-[invalid=true]:border-danger aria-[invalid=true]:text-danger",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
