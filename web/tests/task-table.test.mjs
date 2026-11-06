/* 列表/表格视图纯逻辑单测（node --test，零新依赖） */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildBatchRequest,
  flattenBoardTasks,
  nextSort,
  sortTableRows,
  tableRows,
} from "../src/lib/task-table.ts";

const T = (id, patch = {}) => ({
  id,
  board_id: "b-1",
  board_name: "迭代看板",
  column_id: "c-1",
  title: `任务 ${id}`,
  description: null,
  assignee_id: null,
  assignee: null,
  priority: "medium",
  status: "todo",
  position: 0,
  due_date: null,
  start_date: null,
  created_by: "u-1",
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
  labels: [],
  ...patch,
});

const COLUMNS = [
  {
    id: "c-1",
    board_id: "b-1",
    name: "待办",
    position: 0,
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
    tasks: [T("a"), T("b"), T("c")],
  },
  {
    id: "c-2",
    board_id: "b-1",
    name: "进行中",
    position: 1,
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
    tasks: [T("d")],
  },
];

const EMPTY = { labelId: null, priority: null, assigneeId: null };

test("flattenBoardTasks: 摊平所有列并带列名", () => {
  const rows = flattenBoardTasks(COLUMNS);
  assert.equal(rows.length, 4);
  assert.equal(rows[0].columnName, "待办");
  assert.equal(rows[3].columnName, "进行中");
});

test("sortTableRows: 标题升降序且稳定", () => {
  const rows = flattenBoardTasks(COLUMNS);
  assert.deepEqual(sortTableRows(rows, "title", "asc").map((r) => r.task.id), ["a", "b", "c", "d"]);
  assert.deepEqual(sortTableRows(rows, "title", "desc").map((r) => r.task.id), ["d", "c", "b", "a"]);
});

test("sortTableRows: 优先级 / 状态按业务顺序而非字母序", () => {
  const rows = flattenBoardTasks([
    { ...COLUMNS[0], tasks: [T("low", { priority: "low" }), T("urgent", { priority: "urgent" }), T("high", { priority: "high" })] },
  ]);
  assert.deepEqual(sortTableRows(rows, "priority", "asc").map((r) => r.task.id), ["low", "high", "urgent"]);

  const statusRows = flattenBoardTasks([
    { ...COLUMNS[0], tasks: [T("done", { status: "done" }), T("todo", { status: "todo" }), T("prog", { status: "in_progress" })] },
  ]);
  assert.deepEqual(sortTableRows(statusRows, "status", "asc").map((r) => r.task.id), ["todo", "prog", "done"]);
});

test("sortTableRows: 无截止日期恒排最后", () => {
  const rows = flattenBoardTasks([
    { ...COLUMNS[0], tasks: [T("none"), T("early", { due_date: "2026-01-01" }), T("late", { due_date: "2026-12-01" })] },
  ]);
  assert.deepEqual(sortTableRows(rows, "due_date", "asc").map((r) => r.task.id), ["early", "late", "none"]);
});

test("tableRows: 筛选 + 排序组合", () => {
  const cols = [
    {
      ...COLUMNS[0],
      tasks: [
        T("x", { priority: "high", title: "B 任务" }),
        T("y", { priority: "low", title: "A 任务" }),
        T("z", { priority: "high", title: "C 任务" }),
      ],
    },
  ];
  const rows = tableRows(cols, { ...EMPTY, priority: "high" }, "title", "asc");
  assert.deepEqual(rows.map((r) => r.task.id), ["x", "z"]);
  assert.deepEqual(tableRows(cols, EMPTY, "title", "asc").map((r) => r.task.id), ["y", "x", "z"]);
});

test("buildBatchRequest: value 可选，删除不传 value", () => {
  assert.deepEqual(buildBatchRequest(["a", "b"], "set_status", "done"), {
    task_ids: ["a", "b"], action: "set_status", value: "done",
  });
  assert.deepEqual(buildBatchRequest(["a"], "delete"), { task_ids: ["a"], action: "delete" });
  assert.deepEqual(buildBatchRequest(["a"], "set_assignee", null), {
    task_ids: ["a"], action: "set_assignee",
  });
});

test("nextSort: 同列切方向，换列重置为升序", () => {
  assert.deepEqual(nextSort("title", "title", "asc"), { key: "title", dir: "desc" });
  assert.deepEqual(nextSort("title", "title", "desc"), { key: "title", dir: "asc" });
  assert.deepEqual(nextSort("title", "priority", "desc"), { key: "priority", dir: "asc" });
});
