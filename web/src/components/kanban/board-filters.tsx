"use client";

import { Filter, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useLabels } from "@/hooks/use-labels";
import { useMembers } from "@/hooks/use-members";
import { isFilterActive, type BoardFilter } from "@/lib/board-filter";
import type { Priority } from "@/lib/api-types";

const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: "low", label: "低" },
  { value: "medium", label: "中" },
  { value: "high", label: "高" },
  { value: "urgent", label: "紧急" },
];

/** 看板客户侧筛选条：按标签 + 优先级 + 负责人过滤（不影响已加载数据，筛选时不拖拽）。 */
export function BoardFilters({
  teamId,
  filter,
  onChange,
}: {
  teamId: string;
  filter: BoardFilter;
  onChange: (f: BoardFilter) => void;
}) {
  const { data: labels } = useLabels(teamId);
  const { data: members } = useMembers(teamId);
  const active = isFilterActive(filter);

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 pb-2">
      <span className="flex items-center gap-1 text-xs text-meta">
        <Filter size={14} strokeWidth={1.5} /> 筛选
      </span>
      <Select
        value={filter.labelId ?? "all"}
        onValueChange={(v) => onChange({ ...filter, labelId: v === "all" ? null : v })}
      >
        <SelectTrigger className="h-8 w-[140px] text-xs">
          <SelectValue placeholder="全部标签" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全部标签</SelectItem>
          {(labels || []).map((l) => (
            <SelectItem key={l.id} value={l.id}>
              {l.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={filter.priority ?? "all"}
        onValueChange={(v) => onChange({ ...filter, priority: v === "all" ? null : (v as Priority) })}
      >
        <SelectTrigger className="h-8 w-[120px] text-xs">
          <SelectValue placeholder="全部优先级" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全部优先级</SelectItem>
          {PRIORITY_OPTIONS.map((p) => (
            <SelectItem key={p.value} value={p.value}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={filter.assigneeId ?? "all"}
        onValueChange={(v) => onChange({ ...filter, assigneeId: v === "all" ? null : v })}
      >
        <SelectTrigger className="h-8 w-[140px] text-xs">
          <SelectValue placeholder="全部负责人" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全部负责人</SelectItem>
          {(members || []).map((m) => (
            <SelectItem key={m.user.id} value={m.user.id}>
              {m.user.display_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {active ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-8"
          onClick={() => onChange({ labelId: null, priority: null, assigneeId: null })}
        >
          <X size={14} strokeWidth={1.5} /> 清除
        </Button>
      ) : null}
    </div>
  );
}
