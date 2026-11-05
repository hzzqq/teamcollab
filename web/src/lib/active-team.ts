/* ============================================================
   active-team.ts — 当前生效团队的解析规则（纯逻辑，无副作用依赖）

   Spec §2 验收主线要求「PM 在我的任务/项目看板看到全局」，而 /me 的 team
   字段固定返回「加入最早的团队」——多团队用户无法切换，看板/成员页都
   锁死在第一个团队。本模块把解析规则独立为纯函数，便于单测（node:test）。

   优先级：localStorage 记住的团队 > 第一个团队（加入最早）。
   记住的团队若已不在成员列表中（被移除），自动回落第一个团队。

   注意：这里刻意用相对路径 import —— node:test 直接跑 .ts 时不解析
   tsconfig 的路径别名（@/*），用别名会导致单测无法加载本模块。
   ============================================================ */

import type { Role } from "./api-types.ts";

export const ACTIVE_TEAM_KEY = "teamcollab.active_team_id";

export interface ActiveTeamLike {
  team: { id: string };
  role: string;
}

export function readActiveTeamId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACTIVE_TEAM_KEY);
}

export function setActiveTeamId(teamId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACTIVE_TEAM_KEY, teamId);
}

/**
 * 解析当前生效的团队；无团队时返回 null。
 */
export function resolveActiveTeam<T extends ActiveTeamLike>(
  teams: T[] | undefined,
): { teamId: string; role: Role } | null {
  if (!teams || teams.length === 0) return null;

  const remembered = readActiveTeamId();
  const matched = remembered ? teams.find((t) => t.team.id === remembered) : undefined;
  const active = matched ?? teams[0];
  return { teamId: active.team.id, role: active.role as Role };
}
