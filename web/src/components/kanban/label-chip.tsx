"use client";

import type { Label } from "@/lib/api-types";
import { cn } from "@/lib/utils";

/** 标签芯片：用 color-mix 以标签色按主题衬底，文字用标签色本身（双主题自适应）。 */
export function LabelChip({
  label,
  className,
  dotOnly = false,
}: {
  label: Label;
  className?: string;
  dotOnly?: boolean;
}) {
  const c = `var(--color-tag-${label.color})`;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-xs font-medium",
        className,
      )}
      style={
        dotOnly
          ? undefined
          : { backgroundColor: `color-mix(in oklab, ${c} 16%, var(--surface))`, color: c }
      }
    >
      <span className="size-1.5 rounded-full" style={{ backgroundColor: c }} />
      {dotOnly ? null : label.name}
    </span>
  );
}
