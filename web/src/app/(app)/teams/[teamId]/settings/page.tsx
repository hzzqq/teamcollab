"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { useMe, canAdmin } from "@/hooks/use-me";
import { useLabels, useCreateLabel, useUpdateLabel, useDeleteLabel } from "@/hooks/use-labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LabelChip } from "@/components/kanban/label-chip";
import { EmptyState, StateSwitch, SkeletonRows } from "@/components/common/states";
import { cn } from "@/lib/utils";
import type { LabelColor } from "@/lib/api-types";

const COLOR_OPTIONS: LabelColor[] = ["blue", "green", "amber", "rose", "slate"];
const COLOR_LABEL: Record<LabelColor, string> = {
  blue: "蓝",
  green: "绿",
  amber: "琥珀",
  rose: "玫红",
  slate: "灰",
};

/** 颜色选择块（双主题下用 bg-tag-* 工具类，色值来自 globals.css 的 --color-tag-*） */
function ColorSwatch({
  color,
  active,
  onClick,
}: {
  color: LabelColor;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={COLOR_LABEL[color]}
      onClick={onClick}
      className={cn(
        "size-6 rounded-full ring-offset-2 ring-offset-surface transition",
        active ? "ring-2 ring-fg" : "ring-0 hover:scale-110",
        `bg-tag-${color}`,
      )}
    />
  );
}

export default function TeamSettingsPage() {
  const params = useParams<{ teamId: string }>();
  const teamId = String(params.teamId || "");
  const { data: me } = useMe();
  const isAdmin = canAdmin(me?.role);

  const { data: labels, isLoading, isError, refetch } = useLabels(teamId);
  const createLabel = useCreateLabel(teamId);
  const updateLabel = useUpdateLabel(teamId);
  const deleteLabel = useDeleteLabel(teamId);

  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<LabelColor>("blue");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftColor, setDraftColor] = useState<LabelColor>("blue");
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  async function handleCreate() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    try {
      await createLabel.mutateAsync({ name: trimmed, color: newColor });
      setNewName("");
      setNewColor("blue");
      toast.success("标签已创建");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "创建失败");
    }
  }

  function startEdit(label: { id: string; name: string; color: LabelColor }) {
    setEditingId(label.id);
    setDraftName(label.name);
    setDraftColor(label.color);
  }

  async function handleSaveEdit(labelId: string) {
    const trimmed = draftName.trim();
    if (!trimmed) return;
    try {
      await updateLabel.mutateAsync({ labelId, req: { name: trimmed, color: draftColor } });
      setEditingId(null);
      toast.success("标签已更新");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "更新失败");
    }
  }

  async function handleDelete(labelId: string) {
    try {
      await deleteLabel.mutateAsync(labelId);
      setConfirmingDelete(null);
      toast.success("标签已删除");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "删除失败");
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-6">
      <div className="mb-5">
        <h2 className="text-xl font-semibold text-fg">团队设置</h2>
        <p className="text-sm text-muted">管理团队级标签（用于任务分类与看板筛选）</p>
      </div>

      {isAdmin ? (
        <div className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-border bg-surface p-3">
          <div className="flex-1 min-w-48">
            <label className="mb-1 block text-xs text-muted">新标签名称</label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="例如：紧急、待评审"
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">颜色</label>
            <div className="flex items-center gap-1.5">
              {COLOR_OPTIONS.map((c) => (
                <ColorSwatch key={c} color={c} active={newColor === c} onClick={() => setNewColor(c)} />
              ))}
            </div>
          </div>
          <Button onClick={handleCreate} disabled={createLabel.isPending || !newName.trim()}>
            <Plus size={16} strokeWidth={1.5} />
            新建
          </Button>
        </div>
      ) : (
        <div className="mb-4 rounded-lg border border-border bg-surface-warm px-3 py-2 text-sm text-muted">
          只有管理员可新建 / 编辑 / 删除标签。
        </div>
      )}

      <StateSwitch
        isLoading={isLoading}
        isError={isError}
        errorMessage="标签加载失败"
        onRetry={() => refetch()}
        isEmpty={!isLoading && !isError && labels?.length === 0}
        skeleton={<SkeletonRows rows={3} />}
        empty={
          <EmptyState
            icon={Pencil}
            title="还没有标签"
            description="创建标签后，可在看板筛选与任务上标记分类。"
          />
        }
      >
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-soft text-xs text-meta">
                <th className="px-3 py-2 text-left font-medium">标签</th>
                <th className="px-3 py-2 text-left font-medium">颜色</th>
                {isAdmin ? <th className="px-3 py-2 text-right font-medium">操作</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {labels?.map((l) =>
                editingId === l.id ? (
                  <tr key={l.id} className="bg-surface-warm">
                    <td className="px-3 py-2.5">
                      <Input
                        autoFocus
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveEdit(l.id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        className="h-8"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        {COLOR_OPTIONS.map((c) => (
                          <ColorSwatch key={c} color={c} active={draftColor === c} onClick={() => setDraftColor(c)} />
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" onClick={() => handleSaveEdit(l.id)} disabled={updateLabel.isPending || !draftName.trim()}>
                          <Check size={15} strokeWidth={1.5} />
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => setEditingId(null)}>
                          <X size={15} strokeWidth={1.5} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={l.id} className="transition-colors duration-fast hover:bg-surface-warm">
                    <td className="px-3 py-2.5">
                      <LabelChip label={l} />
                    </td>
                    <td className="px-3 py-2.5 text-meta">{COLOR_LABEL[l.color]}</td>
                    {isAdmin ? (
                      <td className="px-3 py-2.5 text-right">
                        {confirmingDelete === l.id ? (
                          <div className="flex justify-end items-center gap-1">
                            <span className="text-xs text-danger">确认删除？</span>
                            <Button size="sm" variant="destructive" onClick={() => handleDelete(l.id)} disabled={deleteLabel.isPending}>
                              删除
                            </Button>
                            <Button size="sm" variant="secondary" onClick={() => setConfirmingDelete(null)}>
                              取消
                            </Button>
                          </div>
                        ) : (
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" onClick={() => startEdit(l)} aria-label="编辑标签">
                              <Pencil size={15} strokeWidth={1.5} />
                            </Button>
                            <Button size="sm" variant="ghost" className="text-danger hover:bg-danger/10" onClick={() => setConfirmingDelete(l.id)} aria-label="删除标签">
                              <Trash2 size={15} strokeWidth={1.5} />
                            </Button>
                          </div>
                        )}
                      </td>
                    ) : null}
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      </StateSwitch>
    </div>
  );
}
