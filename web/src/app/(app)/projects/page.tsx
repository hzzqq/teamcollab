"use client";

import Link from "next/link";
import { FolderKanban, Plus, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMe } from "@/hooks/use-me";
import { useMyTeams, setActiveTeamId } from "@/hooks/use-teams";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, StateSwitch, SkeletonRows } from "@/components/common/states";

const ROLE_LABEL: Record<string, string> = {
  owner: "拥有者",
  admin: "管理员",
  member: "成员",
  viewer: "只读",
};

/**
 * 项目列表 = 当前用户所属的全部团队。
 *
 * Spec §2 验收主线里的「项目」即团队实体（PM 注册组织 → 建项目 → 拆任务）。
 * 该页此前没有对应路由（Sidebar 的「项目」是死链），此处补齐，
 * 同时提供团队切换入口与建团队入口。
 */
export default function ProjectsPage() {
  const router = useRouter();
  const { data: me } = useMe();
  const { data: teams, isLoading, isError, refetch } = useMyTeams();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  const list = teams ?? [];
  const activeTeamId = me?.team?.id;

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    try {
      const created = await api.createTeam(trimmed);
      setName("");
      setOpen(false);
      // 新建的团队自动设为当前团队
      setActiveTeamId(created.id);
      await refetch();
      router.push(`/boards/${created.id}`);
    } catch {
      // 错误提示由全局 mutation/请求层 toast 处理
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="page-container">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-fg">项目</h2>
          <p className="text-sm text-muted">你所属的团队，点击卡片进入该团队的看板</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus size={16} strokeWidth={1.5} />
          新建团队
        </Button>
      </div>

      <StateSwitch
        isLoading={isLoading}
        isError={isError}
        errorMessage="项目加载失败"
        onRetry={() => refetch()}
        isEmpty={!isLoading && !isError && list.length === 0}
        skeleton={<SkeletonRows rows={3} />}
        empty={
          <EmptyState
            icon={FolderKanban}
            title="还没有项目"
            description="创建第一个团队，开始搭建任务看板。"
            action={
              <Button onClick={() => setOpen(true)}>
                <Plus size={16} strokeWidth={1.5} />
                新建团队
              </Button>
            }
          />
        }
      >
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {list.map(({ team, role }) => (
            <Link
              key={team.id}
              href="/boards"
              onClick={() => setActiveTeamId(team.id)}
              className="card-surface flex flex-col items-start gap-1 p-4 text-left transition-colors duration-fast hover:border-primary-500"
              /* card-surface 的 border 简写与 Tailwind utility 同属 utilities 层，
                 选中态用内联 borderColor 锁死，不依赖 CSS 生成顺序 */
              style={
                team.id === activeTeamId
                  ? { borderColor: "var(--color-primary-500)" }
                  : undefined
              }
            >
              <span className="flex size-9 items-center justify-center rounded-md bg-primary-50 text-primary-600 dark:bg-surface-warm">
                <FolderKanban size={18} strokeWidth={1.5} />
              </span>
              <span className="mt-1 text-sm font-medium text-fg">{team.name}</span>
              <span className="flex items-center gap-1 text-xs text-meta">
                <Users size={12} strokeWidth={1.5} />
                {ROLE_LABEL[role] ?? role}
                {team.id === activeTeamId ? " · 当前" : ""}
              </span>
            </Link>
          ))}
        </div>
      </StateSwitch>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建团队</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：产品迭代 Q3"
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim()) {
                void handleCreate();
              }
            }}
          />
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button onClick={handleCreate} disabled={creating || !name.trim()}>
              {creating ? "创建中" : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
