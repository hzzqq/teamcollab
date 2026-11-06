"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SHORTCUTS } from "@/lib/shortcuts";

export function ShortcutHelp({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-label="键盘快捷键">
        <DialogHeader>
          <DialogTitle>键盘快捷键</DialogTitle>
          <DialogDescription>
            在任意页面可用；输入框聚焦或弹层打开时，单键快捷键自动让位。
          </DialogDescription>
        </DialogHeader>
        <ul className="divide-y divide-border-soft">
          {SHORTCUTS.map((s) => (
            <li key={s.action} className="flex items-center justify-between gap-4 py-2.5 text-sm">
              <span className="text-fg">{s.label}</span>
              <kbd className="shrink-0 rounded-[var(--radius-sm)] border border-border bg-surface-warm px-2 py-0.5 font-mono text-xs text-fg-2">
                {s.keys}
              </kbd>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
