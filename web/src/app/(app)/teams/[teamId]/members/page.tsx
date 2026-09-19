"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Check, Copy, Link2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { useMe, canAdmin } from "@/hooks/use-me";
import { useMembers, useInviteMember, useUpdateMemberRole, useRemoveMember } from "@/hooks/use-members";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, StateSwitch, SkeletonRows } from "@/components/common/states";
import { initials } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { Role } from "@/lib/api-types";

const ROLE_LABEL: Record<Role, string> = {
  owner: "拥有者",
  admin: "管理员",
  member: "成员",
  viewer: "只读",
};
const ROLE_OPTIONS: Role[] = ["admin", "member", "viewer"];

export default function MembersPage() {
  const params = useParams<{ teamId: string }>();
  const teamId = String(params.teamId || "");
  const { data: me } = useMe();
  const isAdmin = canAdmin(me?.role);
  const { data: members, isLoading, isError, refetch } = useMembers(teamId);
  const invite = useInviteMember(teamId);
  const updateRole = useUpdateMemberRole(teamId);
  const removeMember = useRemoveMember(teamId);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleInvite() {
    const trimmed = email.trim();
    if (!trimmed) return;
    setInviteLink(null);
    try {
      await invite.mutateAsync({ email: trimmed, role });
      setEmail("");
    } catch (err) {
      // 未注册邮箱：给出去注册即入队的邀请链接（其他错误由全局 toast 处理）
      if (err instanceof ApiError && err.code === 40001 && err.message.includes("尚未注册")) {
        setInviteLink(
          `${window.location.origin}/register?invite=${teamId}&email=${encodeURIComponent(trimmed)}`
        );
        setCopied(false);
      }
    }
  }

  async function copyInviteLink() {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    toast.success("邀请链接已复制，发给对方即可完成注册入队");
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-6">
      <div className="mb-5">
        <h2 className="text-xl font-semibold text-fg">团队成员</h2>
        <p className="text-sm text-muted">邀请成员、分配角色（只读成员仅可查看）</p>
      </div>

      {isAdmin ? (
        <div className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-border bg-surface p-3">
          <div className="flex-1 min-w-56">
            <label className="mb-1 block text-xs text-muted">邀请成员邮箱</label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@company.com"
              onKeyDown={(e) => e.key === "Enter" && handleInvite()}
            />
          </div>
          <div className="w-32">
            <label className="mb-1 block text-xs text-muted">角色</label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleInvite} disabled={invite.isPending || !email.trim()}>
            <UserPlus size={16} strokeWidth={1.5} />
            邀请
          </Button>
        </div>
      ) : null}

      {isAdmin && inviteLink ? (
        <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border bg-primary-50 p-3 text-sm">
          <Link2 size={16} strokeWidth={1.5} className="shrink-0 text-primary-600" />
          <span className="text-fg">该邮箱尚未注册，把邀请链接发给 TA，注册后自动加入团队：</span>
          <code className="min-w-0 flex-1 truncate rounded bg-surface px-2 py-1 text-xs text-meta">
            {inviteLink}
          </code>
          <Button variant="outline" size="sm" onClick={copyInviteLink}>
            {copied ? (
              <Check size={16} strokeWidth={1.5} />
            ) : (
              <Copy size={16} strokeWidth={1.5} />
            )}
            复制链接
          </Button>
        </div>
      ) : null}

      <StateSwitch
        isLoading={isLoading}
        isError={isError}
        errorMessage="成员加载失败"
        onRetry={() => refetch()}
        isEmpty={!isLoading && !isError && members?.length === 0}
        skeleton={<SkeletonRows rows={4} />}
        empty={<EmptyState icon={Users} title="还没有成员" description="邀请同事加入团队，一起协作任务。" />}
      >
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-soft text-xs text-meta">
                <th className="px-3 py-2 text-left font-medium">成员</th>
                <th className="px-3 py-2 text-left font-medium">邮箱</th>
                <th className="px-3 py-2 text-left font-medium">角色</th>
                {isAdmin ? <th className="px-3 py-2 text-right font-medium">操作</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {members?.map((m) => {
                const isOwner = m.role === "owner";
                const canEditThis = isAdmin && !isOwner;
                return (
                  <tr key={m.user.id} className="transition-colors duration-fast hover:bg-surface-warm">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <Avatar className="size-7">
                          <AvatarFallback>{initials(m.user.display_name)}</AvatarFallback>
                        </Avatar>
                        <span className="text-fg">{m.user.display_name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-meta">{m.user.email}</td>
                    <td className="px-3 py-2.5">
                      {canEditThis ? (
                        <Select
                          value={m.role}
                          onValueChange={(v) => updateRole.mutate({ userId: m.user.id, role: v as Role })}
                        >
                          <SelectTrigger className="h-8 w-28">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLE_OPTIONS.map((r) => (
                              <SelectItem key={r} value={r}>
                                {ROLE_LABEL[r]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant={isOwner ? "default" : "secondary"}>{ROLE_LABEL[m.role]}</Badge>
                      )}
                    </td>
                    {isAdmin ? (
                      <td className="px-3 py-2.5 text-right">
                        {canEditThis ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-danger hover:bg-danger/10"
                            onClick={() => removeMember.mutate(m.user.id)}
                            disabled={removeMember.isPending}
                          >
                            移除
                          </Button>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </StateSwitch>
    </div>
  );
}
