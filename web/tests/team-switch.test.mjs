/**
 * 团队切换解析逻辑单测（node:test + Node 原生 TS 类型剥离，零额外依赖）。
 *
 * 背景：Spec §2 的验收主线要求「PM 在我的任务/项目看板看到全局」，
 * 而 /me 的 team 字段固定返回「加入最早的团队」——多团队用户无法切换，
 * 看板/成员页都锁死在第一个团队。本模块把「当前生效团队」的解析规则独立出来。
 *
 * 运行：npm test（= node --experimental-strip-types --test tests/*.test.mjs）
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveActiveTeam } from "../src/lib/active-team.ts";

const team = (id, name) => ({ id, name, created_at: "2026-01-01T00:00:00Z" });

/** 构造团队列表（role 字段用字符串避免依赖完整类型） */
const teams = (...items) => items.map(([t, role]) => ({ team: t, role }));

test("无团队时返回 null", () => {
  assert.equal(resolveActiveTeam(undefined), null);
  assert.equal(resolveActiveTeam([]), null);
});

test("单团队时返回该团队", () => {
  const r = resolveActiveTeam(teams([team("t-1", "A"), "owner"]));
  assert.equal(r.teamId, "t-1");
  assert.equal(r.role, "owner");
});

test("多团队时默认取第一个（加入最早）", () => {
  const r = resolveActiveTeam(
    teams([team("t-1", "A"), "owner"], [team("t-2", "B"), "member"]),
  );
  assert.equal(r.teamId, "t-1");
});

test("localStorage 中记录的团队优先生效", () => {
  // 模拟已选择过 t-2
  globalThis.window = {
    localStorage: {
      getItem: (k) => (k === "teamcollab.active_team_id" ? "t-2" : null),
      setItem: () => {},
    },
  };
  const r = resolveActiveTeam(
    teams([team("t-1", "A"), "owner"], [team("t-2", "B"), "member"]),
  );
  assert.equal(r.teamId, "t-2", "应命中记住的团队");
  assert.equal(r.role, "member");
  delete globalThis.window;
});

test("记住的团队已被移除时回落到第一个", () => {
  globalThis.window = {
    localStorage: {
      getItem: (k) => (k === "teamcollab.active_team_id" ? "t-removed" : null),
      setItem: () => {},
    },
  };
  const r = resolveActiveTeam(
    teams([team("t-1", "A"), "owner"], [team("t-2", "B"), "member"]),
  );
  assert.equal(r.teamId, "t-1", "失效的团队 id 应回落");
  delete globalThis.window;
});
