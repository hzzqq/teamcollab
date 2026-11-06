/* 活动流文案纯逻辑单测（node --test，零新依赖） */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACTIVITY_FIELD_LABELS,
  activityIcon,
  clipActivityValue,
  formatActivity,
} from "../src/lib/activity-format.ts";

function act(patch = {}) {
  return {
    id: "ac-1",
    task_id: "tk-1",
    actor_id: "u-1",
    actor_name: "沈知远",
    action: "field_changed",
    field: "status",
    old_value: "待办",
    new_value: "进行中",
    created_at: "2026-11-06T10:00:00Z",
    ...patch,
  };
}

test("clipActivityValue: 空值统一为「空」，长文本裁剪", () => {
  assert.equal(clipActivityValue(null), "空");
  assert.equal(clipActivityValue(undefined), "空");
  assert.equal(clipActivityValue("   "), "空");
  assert.equal(clipActivityValue("  进行中  "), "进行中");
  assert.equal(clipActivityValue("长".repeat(61), 60), `${"长".repeat(60)}…`);
  assert.equal(clipActivityValue("短文本"), "短文本");
});

test("activityIcon: 四种动作 + 未知兜底", () => {
  assert.equal(activityIcon("created"), "plus");
  assert.equal(activityIcon("field_changed"), "edit");
  assert.equal(activityIcon("moved"), "move");
  assert.equal(activityIcon("comment_added"), "message");
  assert.equal(activityIcon("unknown"), "dot");
});

test("formatActivity: created 带任务标题", () => {
  const text = formatActivity(
    act({ action: "created", field: null, old_value: null, new_value: "梳理需求" }),
  );
  assert.equal(text, "创建了任务「梳理需求」");
});

test("formatActivity: field_changed 翻译字段名并展示旧→新", () => {
  assert.equal(formatActivity(act()), "把状态从「待办」改为「进行中」");
  assert.equal(
    formatActivity(act({ field: "assignee_id", old_value: "空", new_value: "林晚晴" })),
    "把负责人从「空」改为「林晚晴」",
  );
  assert.equal(
    formatActivity(act({ field: "due_date", old_value: null, new_value: "2026-11-20" })),
    "把截止日期从「空」改为「2026-11-20」",
  );
});

test("formatActivity: moved / comment_added", () => {
  assert.equal(
    formatActivity(act({ action: "moved", field: "column", old_value: "待办", new_value: "进行中" })),
    "把任务从「待办」移动到「进行中」",
  );
  assert.equal(
    formatActivity(act({ action: "comment_added", new_value: "收到" })),
    "添加了评论",
  );
});

test("formatActivity: 未知字段名 / 未知动作不崩", () => {
  assert.equal(
    formatActivity(act({ field: "future_field" })),
    "把future_field从「待办」改为「进行中」",
  );
  assert.equal(formatActivity(act({ action: "future_action" })), "更新了任务");
});

test("字段名映射覆盖后端全部 TRACKED_FIELDS（防 real/mock 漂移）", () => {
  const backendFields = [
    "title", "description", "status", "priority", "assignee_id", "column_id",
    "start_date", "due_date", "labels", "checklist", "column",
  ];
  for (const field of backendFields) {
    assert.ok(ACTIVITY_FIELD_LABELS[field], `缺少字段名映射: ${field}`);
  }
});
