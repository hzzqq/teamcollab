"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, FileText, LayoutGrid, Loader2, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDebounce } from "@/hooks/use-debounce";
import { useSearch } from "@/hooks/use-search";
import { flattenHits, type PaletteItem } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

/** 全局命令面板：Cmd/Ctrl+K 唤起，跨看板搜任务 / 看板，回车深链打开任务详情。 */
export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const debounced = useDebounce(q, 250);
  const { data, isFetching, isError } = useSearch(debounced, open);
  const items = useMemo(() => flattenHits(data), [data]);

  // 关闭后清空，避免下次打开残留上次关键词和旧结果
  useEffect(() => {
    if (!open) {
      setQ("");
      setActive(0);
    }
  }, [open]);
  useEffect(() => setActive(0), [debounced]);

  function go(item: PaletteItem) {
    onOpenChange(false);
    router.push(item.href);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((v) => (items.length ? (v + 1) % items.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((v) => (items.length ? (v - 1 + items.length) % items.length : 0));
    } else if (e.key === "Enter" && items[active]) {
      e.preventDefault();
      go(items[active]);
    }
  }

  const idle = q.trim() === "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-label="全局搜索"
        className="top-[18%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0"
      >
        <DialogTitle className="sr-only">全局搜索</DialogTitle>
        <DialogDescription className="sr-only">
          搜索你所在团队的任务与看板，使用上下方向键选择、回车打开。
        </DialogDescription>

        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          {isFetching ? (
            <Loader2 size={18} strokeWidth={1.5} className="animate-spin text-meta" />
          ) : (
            <Search size={18} strokeWidth={1.5} className="text-meta" />
          )}
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="搜索任务、看板…"
            aria-label="搜索任务与看板"
            className="h-8 w-full bg-transparent text-sm text-fg outline-none placeholder:text-meta"
          />
          <kbd className="shrink-0 rounded-[var(--radius-sm)] border border-border bg-surface-warm px-1.5 py-0.5 font-mono text-[10px] text-meta">
            Esc
          </kbd>
        </div>

        <div className="max-h-[320px] min-h-[120px] overflow-y-auto p-2">
          {idle ? (
            <p className="px-2 py-6 text-center text-sm text-meta">
              输入关键词，搜索你所在团队的全部任务与看板
            </p>
          ) : isError ? (
            <p className="px-2 py-6 text-center text-sm text-danger">搜索失败，请稍后重试</p>
          ) : items.length === 0 && !isFetching ? (
            <p className="px-2 py-6 text-center text-sm text-meta">
              没有找到与「{debounced}」相关的任务或看板
            </p>
          ) : (
            items.map((item, i) => (
              <Fragment key={`${item.kind}:${item.id}`}>
                {(i === 0 || items[i - 1].kind !== item.kind) && (
                  <p className="px-2 pb-1 pt-2 text-xs font-medium text-meta">
                    {item.kind === "task" ? "任务" : "看板"}
                  </p>
                )}
                <button
                  type="button"
                  data-palette-item={item.id}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(item)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors duration-fast",
                    active === i ? "bg-primary-50" : "hover:bg-surface-warm",
                  )}
                >
                  {item.kind === "task" ? (
                    <FileText size={15} strokeWidth={1.5} className="shrink-0 text-meta" />
                  ) : (
                    <LayoutGrid size={15} strokeWidth={1.5} className="shrink-0 text-meta" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-fg">{item.title}</span>
                    <span className="block truncate text-xs text-meta">{item.subtitle}</span>
                  </span>
                  {active === i ? (
                    <CornerDownLeft size={14} strokeWidth={1.5} className="shrink-0 text-meta" />
                  ) : null}
                </button>
              </Fragment>
            ))
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-border px-4 py-2 text-xs text-meta">
          <span>↑↓ 选择</span>
          <span>↵ 打开</span>
          <span>Esc 关闭</span>
          {items.length > 0 ? <span className="ml-auto">{items.length} 个结果</span> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
