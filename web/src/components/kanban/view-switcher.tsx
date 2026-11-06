"use client";

import { useState } from "react";
import { Bookmark, Check, ChevronDown, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSavedViews, useCreateView, useDeleteView } from "@/hooks/use-saved-views";
import type { BoardFilter } from "@/lib/board-filter";
import { toViewFilter } from "@/lib/board-filter";
import type { Role, SavedView } from "@/lib/api-types";
import type { SortDir, SortKey } from "@/lib/task-table";

/**
 * 保存视图选择器：把当前「筛选 + 视图类型 + 排序」存为团队级命名视图，
 * 也支持一键应用 / 删除（owner / 团队管理员 / 创建者可删）。
 */
export function ViewSwitcher({
  teamId,
  currentView,
  filter,
  sortKey,
  sortDir,
  role,
  currentUserId,
  onApplyView,
}: {
  teamId: string;
  currentView: "board" | "list";
  filter: BoardFilter;
  sortKey: SortKey;
  sortDir: SortDir;
  role: Role | undefined;
  currentUserId: string;
  onApplyView: (v: SavedView) => void;
}) {
  const { data } = useSavedViews(teamId);
  const createView = useCreateView(teamId);
  const deleteView = useDeleteView(teamId);
  const views = data?.items || [];
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");

  const canSave = role === "owner" || role === "admin" || role === "member";
  const canManage = (v: SavedView) =>
    role === "owner" || role === "admin" || v.owner_id === currentUserId;

  function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;
    createView.mutate(
      {
        name: trimmed,
        view: currentView,
        filters: toViewFilter(filter),
        sort_key: currentView === "list" ? sortKey : null,
        sort_dir: currentView === "list" ? sortDir : null,
      },
      {
        onSuccess: () => {
          toast.success("视图已保存");
          setSaving(false);
          setName("");
        },
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "保存失败"),
      },
    );
  }

  function handleDelete(v: SavedView) {
    deleteView.mutate(v.id, {
      onSuccess: () => toast.success("视图已删除"),
      onError: (e) => toast.error(e instanceof ApiError ? e.message : "删除失败"),
    });
  }

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        className="gap-1"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        aria-label="保存视图与已存视图"
      >
        <Bookmark size={15} strokeWidth={1.5} />
        视图
        <ChevronDown size={13} strokeWidth={1.75} />
      </Button>
      {open ? (
        <div
          className="absolute right-0 z-30 mt-1 w-64 rounded-[var(--radius-card)] border border-border bg-surface p-2 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="px-1 pb-1 text-xs font-medium text-meta">已保存视图</p>
          <div className="max-h-52 space-y-0.5 overflow-auto">
            {views.length === 0 ? (
              <p className="px-1 py-2 text-xs text-meta">暂无保存的视图</p>
            ) : (
              views.map((v) => (
                <div
                  key={v.id}
                  className="group flex items-center gap-1 rounded-sm px-1 py-1 hover:bg-surface-warm"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onApplyView(v);
                      setOpen(false);
                    }}
                    className="min-w-0 flex-1 truncate text-left text-sm text-fg-2 hover:text-primary-600"
                  >
                    {v.name}
                    <span className="ml-1 text-xs text-meta">
                      · {v.view === "list" ? "列表" : "看板"}
                    </span>
                  </button>
                  {canManage(v) ? (
                    <button
                      type="button"
                      aria-label={`删除视图 ${v.name}`}
                      onClick={() => handleDelete(v)}
                      className="rounded-sm p-1 text-meta opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                    >
                      <Trash2 size={13} strokeWidth={1.5} />
                    </button>
                  ) : null}
                </div>
              ))
            )}
          </div>
          {canSave ? (
            <div className="mt-2 border-t border-border pt-2">
              {saving ? (
                <div className="flex items-center gap-1.5">
                  <Input
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="视图名称"
                    aria-label="视图名称"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSave();
                      if (e.key === "Escape") {
                        setSaving(false);
                        setName("");
                      }
                    }}
                    className="h-8 text-xs"
                  />
                  <Button size="sm" onClick={handleSave} disabled={createView.isPending || !name.trim()} aria-label="确认保存">
                    <Check size={14} strokeWidth={1.5} />
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setSaving(false);
                      setName("");
                    }}
                    aria-label="取消保存"
                  >
                    <X size={14} strokeWidth={1.5} />
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setSaving(true)}
                  className="flex w-full items-center gap-1.5 rounded-sm px-1 py-1 text-sm text-primary-600 hover:bg-primary-50"
                >
                  <Plus size={14} strokeWidth={1.5} />
                  将当前视图另存为…
                </button>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
