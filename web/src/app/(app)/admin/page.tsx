"use client";

import { useMemo, useState } from "react";
import {
  KeyRound,
  Shield,
  ShieldCheck,
  Trash2,
  UserCog,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { useMe } from "@/hooks/use-me";
import {
  useAdminCreateUser,
  useAdminDeleteUser,
  useAdminResetPassword,
  useAdminUpdateUser,
  useAdminUsers,
} from "@/hooks/use-admin-users";
import { useAdminTeams } from "@/hooks/use-admin-teams";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { EmptyState, StateSwitch, SkeletonRows } from "@/components/common/states";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/lib/utils";

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export default function AdminPage() {
  const { data: me } = useMe();
  const isSuperuser = Boolean(me?.user?.is_superuser);

  const { data: users, isLoading, isError, refetch } = useAdminUsers();
  const { data: teams } = useAdminTeams();

  const createUser = useAdminCreateUser();
  const updateUser = useAdminUpdateUser();
  const resetPassword = useAdminResetPassword();
  const deleteUser = useAdminDeleteUser();

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [makeSuper, setMakeSuper] = useState(false);

  const [resetFor, setResetFor] = useState<string | null>(null);
  const [resetPw, setResetPw] = useState("");

  const superuserCount = useMemo(
    () => (users ? users.filter((u) => u.is_superuser).length : 0),
    [users],
  );

  if (!isSuperuser) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-6">
        <EmptyState
          icon={Shield}
          title="无访问权限"
          description="管理后台仅对平台超级管理员开放。如需权限请联系现有管理员。"
        />
      </div>
    );
  }

  async function handleCreate() {
    const e = email.trim();
    const n = name.trim();
    if (!e || !n || password.length < 8) {
      toast.error("请填写邮箱、昵称，密码至少 8 位");
      return;
    }
    try {
      await createUser.mutateAsync({ email: e, display_name: n, password, is_superuser: makeSuper });
      toast.success("用户已创建");
      setEmail("");
      setName("");
      setPassword("");
      setMakeSuper(false);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "创建失败，请重试";
      toast.error(msg);
    }
  }

  function toggleSuperuser(userId: string, current: boolean) {
    updateUser
      .mutateAsync({ userId, req: { is_superuser: !current } })
      .then(() => toast.success(current ? "已取消超级管理员" : "已设为超级管理员"))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : "操作失败"));
  }

  function confirmReset(userId: string) {
    if (resetPw.length < 8) {
      toast.error("新密码至少 8 位");
      return;
    }
    resetPassword
      .mutateAsync({ userId, newPassword: resetPw })
      .then(() => {
        toast.success("密码已重置");
        setResetFor(null);
        setResetPw("");
      })
      .catch((err) => toast.error(err instanceof ApiError ? err.message : "重置失败"));
  }

  function handleDelete(userId: string, displayName: string) {
    if (!window.confirm(`确认删除用户「${displayName}」？该操作不可撤销。`)) return;
    deleteUser
      .mutateAsync(userId)
      .then(() => toast.success("用户已删除"))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : "删除失败"));
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-6">
      <div className="mb-5">
        <h2 className="flex items-center gap-2 text-xl font-semibold text-fg">
          <UserCog size={22} strokeWidth={1.5} className="text-primary-600" />
          管理后台
        </h2>
        <p className="text-sm text-muted">平台级账号治理：创建用户、升降超级管理员、重置密码、删除账号，以及全量团队总览。</p>
      </div>

      {/* 创建用户 */}
      <div className="mb-6 rounded-lg border border-border bg-surface p-4">
        <h3 className="mb-3 text-sm font-medium text-fg">新建用户</h3>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1">
            <Label className="mb-1 block text-xs text-muted">邮箱</Label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="newuser@example.com"
              disabled={createUser.isPending}
            />
          </div>
          <div className="min-w-40 flex-1">
            <Label className="mb-1 block text-xs text-muted">昵称</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="新用户" disabled={createUser.isPending} />
          </div>
          <div className="min-w-40 flex-1">
            <Label className="mb-1 block text-xs text-muted">初始密码</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 8 位"
              disabled={createUser.isPending}
            />
          </div>
          <div className="flex items-center gap-2 pb-1.5">
            <Checkbox
              id="make-super"
              checked={makeSuper}
              onCheckedChange={(v) => setMakeSuper(Boolean(v))}
              disabled={createUser.isPending}
            />
            <Label htmlFor="make-super" className="cursor-pointer text-sm text-fg">
              设为超级管理员
            </Label>
          </div>
          <Button onClick={handleCreate} disabled={createUser.isPending}>
            <UserPlus size={16} strokeWidth={1.5} />
            创建
          </Button>
        </div>
      </div>

      {/* 用户列表 */}
      <div className="mb-8">
        <h3 className="mb-3 text-sm font-medium text-fg">全部用户（{users?.length ?? 0}）</h3>
        <StateSwitch
          isLoading={isLoading}
          isError={isError}
          errorMessage="用户加载失败"
          onRetry={() => refetch()}
          isEmpty={!isLoading && !isError && (users?.length ?? 0) === 0}
          skeleton={<SkeletonRows rows={4} />}
          empty={<EmptyState icon={Users} title="还没有用户" description="使用上方表单创建第一个用户。" />}
        >
          <div className="overflow-hidden rounded-lg border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-soft text-xs text-meta">
                  <th className="px-3 py-2 text-left font-medium">用户</th>
                  <th className="px-3 py-2 text-left font-medium">邮箱</th>
                  <th className="px-3 py-2 text-left font-medium">角色</th>
                  <th className="px-3 py-2 text-left font-medium">创建时间</th>
                  <th className="px-3 py-2 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-soft">
                {users?.map((u) => (
                  <tr key={u.id} className="transition-colors duration-fast hover:bg-surface-warm">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <Avatar className="size-7">
                          <AvatarFallback>{initials(u.display_name)}</AvatarFallback>
                        </Avatar>
                        <span className="text-fg">{u.display_name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-meta">{u.email}</td>
                    <td className="px-3 py-2.5">
                      {u.is_superuser ? (
                        <Badge variant="default" className="gap-1">
                          <ShieldCheck size={12} strokeWidth={1.5} />
                          超级管理员
                        </Badge>
                      ) : (
                        <Badge variant="secondary">普通用户</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-meta">{fmtDate(u.created_at)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleSuperuser(u.id, u.is_superuser)}
                          disabled={updateUser.isPending || (u.is_superuser && superuserCount <= 1)}
                          title={u.is_superuser && superuserCount <= 1 ? "至少保留一个超级管理员" : undefined}
                        >
                          {u.is_superuser ? (
                            <>
                              <Shield size={14} strokeWidth={1.5} />
                              取消管理员
                            </>
                          ) : (
                            <>
                              <ShieldCheck size={14} strokeWidth={1.5} />
                              设为管理员
                            </>
                          )}
                        </Button>
                        {resetFor === u.id ? (
                          <div className="flex items-center gap-1">
                            <Input
                              type="password"
                              value={resetPw}
                              onChange={(e) => setResetPw(e.target.value)}
                              placeholder="新密码"
                              className="h-8 w-32"
                            />
                            <Button size="sm" onClick={() => confirmReset(u.id)} disabled={resetPassword.isPending}>
                              确认
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => { setResetFor(null); setResetPw(""); }}>
                              取消
                            </Button>
                          </div>
                        ) : (
                          <Button variant="ghost" size="sm" onClick={() => { setResetFor(u.id); setResetPw(""); }}>
                            <KeyRound size={14} strokeWidth={1.5} />
                            重置密码
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-danger hover:bg-danger/10"
                          onClick={() => handleDelete(u.id, u.display_name)}
                          disabled={deleteUser.isPending}
                        >
                          <Trash2 size={14} strokeWidth={1.5} />
                          删除
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </StateSwitch>
      </div>

      {/* 团队总览 */}
      <div>
        <h3 className="mb-3 text-sm font-medium text-fg">团队总览（{teams?.length ?? 0}）</h3>
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-soft text-xs text-meta">
                <th className="px-3 py-2 text-left font-medium">团队</th>
                <th className="px-3 py-2 text-left font-medium">成员数</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {(teams ?? []).map((t) => (
                <tr key={t.id} className="transition-colors duration-fast hover:bg-surface-warm">
                  <td className="px-3 py-2.5 text-fg">{t.name}</td>
                  <td className="px-3 py-2.5 text-meta">{t.member_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
