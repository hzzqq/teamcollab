/* 任务详情增强纯逻辑单测（node --test，零新依赖） */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildDuplicateRequest,
  checklistProgress,
  newChecklistItem,
  shortTaskId,
} from "../src/lib/task-detail.ts";

test("shortTaskId: 去连字符取前 8 位，作为稳定短编号", () => {
  assert.equal(shortTaskId("202f97b7-69c4-455f-a471-429bb4191e34"), "202f97b7");
  assert.equal(shortTaskId("tk-1"), "tk1");
  assert.equal(shortTaskId(""), "");
});

test("checklistProgress: 统计完成数，空值安全", () => {
  assert.deepEqual(checklistProgress([
    { id: "a", text: "A", done: true },
    { id: "b", text: "B", done: false },
  ]), { done: 1, total: 2 });
  assert.deepEqual(checklistProgress([]), { done: 0, total: 0 });
  assert.deepEqual(checklistProgress(null), { done: 0, total: 0 });
  assert.deepEqual(checklistProgress(undefined), { done: 0, total: 0 });
});

test("newChecklistItem: 去空白、生成 id、默认未完成", () => {
  const a = newChecklistItem("  写单测  ");
  const b = newChecklistItem("写单测");
  assert.equal(a.text, "写单测");
  assert.equal(a.done, false);
  assert.ok(a.id.startsWith("ck-"));
  assert.notEqual(a.id, b.id);
});

const TASK = {
  id: "202f97b7-69c4-455f-a471-429bb4191e34",
  board_id: "b-1",
  column_id: "c-2",
  title: "实现看板拖拽落位",
  description: "背景说明",
  assignee_id: "u-2",
  assignee: { id: "u-2", display_name: "成员" },
  priority: "high",
  status: "in_progress",
  position: 3,
  due_date: "2026-11-20",
  start_date: "2026-11-10",
  created_by: "u-1",
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-02T00:00:00Z",
  labels: [{ id: "l-1" }],
  checklist: [
    { id: "ck-src-1", text: "写单测", done: true },
    { id: "ck-src-2", text: "跑回归", done: false },
  ],
};

test("buildDuplicateRequest: 保留全字段、标题加副本后缀、清单重新生成 id", () => {
  const req = buildDuplicateRequest(TASK);
  assert.equal(req.title, "实现看板拖拽落位 (副本)");
  assert.equal(req.description, "背景说明");
  assert.equal(req.column_id, "c-2");
  assert.equal(req.assignee_id, "u-2");
  assert.equal(req.priority, "high");
  assert.equal(req.status, "in_progress");
  assert.equal(req.start_date, "2026-11-10");
  assert.equal(req.due_date, "2026-11-20");
  assert.deepEqual(req.label_ids, ["l-1"]);
  assert.deepEqual(req.checklist.map((i) => i.text), ["写单测", "跑回归"]);
  assert.deepEqual(req.checklist.map((i) => i.done), [true, false]);
  for (const item of req.checklist) {
    assert.notEqual(item.id, "ck-src-1");
    assert.notEqual(item.id, "ck-src-2");
    assert.ok(item.id.startsWith("ck-"));
  }
  assert.equal(new Set(req.checklist.map((i) => i.id)).size, 2);
});

test("buildDuplicateRequest: 标题不超过后端 200 字上限", () => {
  const req = buildDuplicateRequest({ ...TASK, title: "长".repeat(200) });
  assert.equal(req.title.length, 200);
  assert.ok(req.title.endsWith(" (副本)"));
});

test("buildDuplicateRequest: 无标签/无清单时返回空数组", () => {
  const req = buildDuplicateRequest({ ...TASK, labels: [], checklist: [] });
  assert.deepEqual(req.label_ids, []);
  assert.deepEqual(req.checklist, []);
});
