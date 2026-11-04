/**
 * 拖拽落位纯函数单测（node:test + Node 原生 TS 类型剥离，零额外依赖）。
 *
 * 背景：历史上前端乐观更新用「map 内提前 return」实现，源列与目标列相同时
 * 插入分支永不执行 —— 卡片从看板凭空消失；跨列时又把「源列」传进 URL 路径，
 * 被后端 400 拒绝。这两个缺陷都被 94 个后端测试漏掉（前后端各测各的）。
 *
 * 本文件锁死前端侧的落位语义，与后端 server/tests/test_drag_contract.py 互为对照。
 *
 * 运行：npm test（= node --experimental-strip-types --test tests/*.test.mjs）
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeMoveTarget,
  applyOptimisticMove,
} from "../src/lib/drag-position.ts";

const task = (id) => ({ id, title: id });
const col = (id, ids) => ({ id, tasks: ids.map(task) });

const board3 = () => [
  col("c1", ["A", "B", "C"]),
  col("c2", ["D", "E"]),
  col("c3", []),
];

const ids = (columns, colId) =>
  columns.find((c) => c.id === colId).tasks.map((t) => t.id);

test("跨列拖拽：路径列必须是目标列（不是源列）", () => {
  const b = board3();
  const t = computeMoveTarget(b, "A", "D");
  assert.equal(t.columnId, "c2", "columnId 应为目标列 c2");
  assert.equal(t.position, 0, "落到 D 上 → position 0");
});

test("同列拖拽：columnId 为本列", () => {
  const b = board3();
  const t = computeMoveTarget(b, "B", "C");
  assert.equal(t.columnId, "c1");
});

test("拖到空列：追加到列尾（position 0）", () => {
  const b = board3();
  const t = computeMoveTarget(b, "A", "c3");
  assert.equal(t.columnId, "c3");
  assert.equal(t.position, 0);
});

test("落空到有任务的列容器：追加到列尾", () => {
  const b = board3();
  const t = computeMoveTarget(b, "A", "c2");
  assert.equal(t.columnId, "c2");
  assert.equal(t.position, 2, "列容器落空 → 追加到末尾");
});

test("找不到被拖任务时返回 null（放弃本次拖拽）", () => {
  const b = board3();
  assert.equal(computeMoveTarget(b, "NOPE", "D"), null);
});

test("乐观更新：同列排序不会让卡片消失（历史 P0）", () => {
  const b = board3();
  const next = applyOptimisticMove(b, "B", "c1", 0);
  assert.deepEqual(ids(next, "c1"), ["B", "A", "C"], "B 应落到列首，其余保持");
});

test("乐观更新：跨列移动同时在源列移除、目标列插入", () => {
  const b = board3();
  const next = applyOptimisticMove(b, "A", "c2", 0);
  assert.deepEqual(ids(next, "c1"), ["B", "C"], "源列应移除 A");
  assert.deepEqual(ids(next, "c2"), ["A", "D", "E"], "目标列应插入 A 到首位");
});

test("乐观更新：移动到空列", () => {
  const b = board3();
  const next = applyOptimisticMove(b, "A", "c3", 0);
  assert.deepEqual(ids(next, "c3"), ["A"]);
  assert.deepEqual(ids(next, "c1"), ["B", "C"]);
});

test("乐观更新：position 越界时被钳制到列尾", () => {
  const b = board3();
  const next = applyOptimisticMove(b, "A", "c2", 99);
  assert.deepEqual(ids(next, "c2"), ["D", "E", "A"], "越界 → 追加到末尾");
});

test("乐观更新：源列 == 目标列时 position 语义与后端一致（先移除自身再插入）", () => {
  const b = board3();
  // C 拖到 A 上 → 期望 C 占据 A 的位置
  const next = applyOptimisticMove(b, "C", "c1", 0);
  assert.deepEqual(ids(next, "c1"), ["C", "A", "B"]);
});

test("乐观更新：不改动其他列", () => {
  const b = board3();
  const next = applyOptimisticMove(b, "A", "c2", 0);
  assert.deepEqual(ids(next, "c3"), [], "无关列不应变化");
});

test("乐观更新：找不到任务时原样返回（不破坏数据）", () => {
  const b = board3();
  const next = applyOptimisticMove(b, "NOPE", "c2", 0);
  assert.deepEqual(ids(next, "c1"), ["A", "B", "C"]);
});
