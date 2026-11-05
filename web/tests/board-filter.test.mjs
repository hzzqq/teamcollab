import { test } from "node:test";
import assert from "node:assert/strict";
import { filterTasks, isFilterActive, EMPTY_FILTER } from "../src/lib/board-filter.ts";

const L = (id, color = "blue") => ({ id, team_id: "t", name: id, color, created_at: "", updated_at: "" });
const T = (id, over = {}) => ({
  id,
  board_id: "b",
  title: id,
  column_id: "c",
  description: null,
  assignee_id: null,
  assignee: null,
  priority: "medium",
  status: "todo",
  position: 0,
  due_date: null,
  start_date: null,
  created_by: "u",
  created_at: "",
  updated_at: "",
  labels: [],
  ...over,
});

test("filterTasks: 空筛选返回全部（顺序一致）", () => {
  const tasks = [T("a"), T("b")];
  assert.deepEqual(filterTasks(tasks, EMPTY_FILTER).map((t) => t.id), ["a", "b"]);
});

test("filterTasks: 按优先级过滤", () => {
  const tasks = [T("a", { priority: "high" }), T("b", { priority: "low" })];;
  const out = filterTasks(tasks, { labelId: null, priority: "high" });
  assert.deepEqual(out.map((t) => t.id), ["a"]);
});

test("filterTasks: 按标签过滤（命中任务含该标签）", () => {
  const tasks = [T("a", { labels: [L("lb1")] }), T("b", { labels: [L("lb2")] })];
  const out = filterTasks(tasks, { labelId: "lb1", priority: null });
  assert.deepEqual(out.map((t) => t.id), ["a"]);
});

test("filterTasks: 标签 + 优先级联合过滤（AND）", () => {
  const tasks = [
    T("a", { priority: "high", labels: [L("lb1")] }),
    T("b", { priority: "high", labels: [L("lb2")] }),
    T("c", { priority: "low", labels: [L("lb1")] }),
  ];
  const out = filterTasks(tasks, { labelId: "lb1", priority: "high" });
  assert.deepEqual(out.map((t) => t.id), ["a"]);
});

test("isFilterActive: 空筛选为 false", () => {
  assert.equal(isFilterActive(EMPTY_FILTER), false);
  assert.equal(isFilterActive({ labelId: "x", priority: null, assigneeId: null }), true);
  assert.equal(isFilterActive({ labelId: null, priority: "urgent", assigneeId: null }), true);
  assert.equal(isFilterActive({ labelId: null, priority: null, assigneeId: "u1" }), true);
});

test("filterTasks: 按负责人过滤", () => {
  const tasks = [T("a", { assignee_id: "u1" }), T("b", { assignee_id: "u2" }), T("c", { assignee_id: null })];
  const out = filterTasks(tasks, { labelId: null, priority: null, assigneeId: "u1" });
  assert.deepEqual(out.map((t) => t.id), ["a"]);
});

test("filterTasks: 负责人 + 标签 + 优先级三条件联合（AND）", () => {
  const tasks = [
    T("a", { assignee_id: "u1", priority: "high", labels: [L("lb1")] }),
    T("b", { assignee_id: "u1", priority: "high", labels: [L("lb2")] }),
    T("c", { assignee_id: "u2", priority: "high", labels: [L("lb1")] }),
    T("d", { assignee_id: "u1", priority: "low", labels: [L("lb1")] }),
  ];
  const out = filterTasks(tasks, { labelId: "lb1", priority: "high", assigneeId: "u1" });
  assert.deepEqual(out.map((t) => t.id), ["a"]);
});

test("filterTasks: 负责人为 null 表示不限（与空筛选一致）", () => {
  const tasks = [T("a", { assignee_id: "u1" }), T("b", { assignee_id: null })];
  assert.deepEqual(filterTasks(tasks, { labelId: null, priority: null, assigneeId: null }).map((t) => t.id), ["a", "b"]);
});
