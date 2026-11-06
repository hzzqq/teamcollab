import { test } from "node:test";
import assert from "node:assert/strict";
import { toViewFilter, fromViewFilter, EMPTY_FILTER } from "../src/lib/board-filter.ts";

test("toViewFilter: 完整筛选映射到后端字段", () => {
  const f = { labelId: "lb1", priority: "high", assigneeId: "u2" };
  assert.deepEqual(toViewFilter(f), {
    label_id: "lb1",
    priority: "high",
    assignee_id: "u2",
  });
});

test("toViewFilter: 空筛选的字段为 null", () => {
  assert.deepEqual(toViewFilter(EMPTY_FILTER), {
    label_id: null,
    priority: null,
    assignee_id: null,
  });
});

test("fromViewFilter: 后端筛选映射回客户侧（缺省补 null）", () => {
  assert.deepEqual(fromViewFilter({ label_id: "lb1" }), {
    labelId: "lb1",
    priority: null,
    assigneeId: null,
  });
});

test("toViewFilter -> fromViewFilter 往返一致", () => {
  const f = { labelId: null, priority: "urgent", assigneeId: "u9" };
  assert.deepEqual(fromViewFilter(toViewFilter(f)), f);
});
