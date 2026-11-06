/* 全局快捷键 / 命令面板纯逻辑单测（node --test，零新依赖） */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  QUICK_ADD_EVENT,
  SHORTCUTS,
  buildBoardDeepLink,
  buildTaskDeepLink,
  flattenHits,
  isTypingTarget,
  resolveShortcut,
} from "../src/lib/shortcuts.ts";

const K = (key, extra = {}) => ({ key, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...extra });
const IDLE = { typing: false, overlayOpen: false };

test("isTypingTarget: 输入类元素让位，其余不拦截", () => {
  assert.equal(isTypingTarget({ tagName: "INPUT" }), true);
  assert.equal(isTypingTarget({ tagName: "textarea" }), true);
  assert.equal(isTypingTarget({ tagName: "SELECT" }), true);
  assert.equal(isTypingTarget({ tagName: "div", isContentEditable: true }), true);
  assert.equal(isTypingTarget({ tagName: "BUTTON" }), false);
  assert.equal(isTypingTarget(null), false);
  assert.equal(isTypingTarget("input"), false);
});

test("resolveShortcut: Cmd/Ctrl+K 任何时候都唤起命令面板", () => {
  assert.equal(resolveShortcut(K("k", { metaKey: true }), IDLE), "palette");
  assert.equal(resolveShortcut(K("K", { ctrlKey: true }), IDLE), "palette");
  assert.equal(resolveShortcut(K("k", { metaKey: true }), { typing: true, overlayOpen: true }), "palette");
  assert.equal(resolveShortcut(K("k", { metaKey: true, altKey: true }), IDLE), null);
});

test("resolveShortcut: 单键在输入框/弹层打开时全部让位", () => {
  assert.equal(resolveShortcut(K("c"), { typing: true, overlayOpen: false }), null);
  assert.equal(resolveShortcut(K("?"), { typing: false, overlayOpen: true }), null);
  assert.equal(resolveShortcut(K("c"), { typing: false, overlayOpen: true }), null);
  assert.equal(resolveShortcut(K("c", { metaKey: true }), IDLE), null);
});

test("resolveShortcut: ? 帮助 / C 新建 / 其它不响应", () => {
  assert.equal(resolveShortcut(K("?", { shiftKey: true }), IDLE), "help");
  assert.equal(resolveShortcut(K("c"), IDLE), "quick-add");
  assert.equal(resolveShortcut(K("C", { shiftKey: true }), IDLE), null);
  assert.equal(resolveShortcut(K("x"), IDLE), null);
  assert.equal(resolveShortcut(K("Enter"), IDLE), null);
});

test("深链: 任务带 ?task=，看板只有路径，特殊字符被编码", () => {
  assert.equal(buildTaskDeepLink("b1", "t1"), "/boards/b1?task=t1");
  assert.equal(buildBoardDeepLink("b1"), "/boards/b1");
  assert.equal(buildTaskDeepLink("a b", "x&y"), "/boards/a%20b?task=x%26y");
});

const RESULT = {
  query: "拖拽",
  tasks: [
    {
      id: "tk-1", title: "实现看板拖拽落位", board_id: "b-1", board_name: "产品迭代 v1.0",
      team_id: "t-1", team_name: "Demo 产品团队", column_id: "c-1", column_name: "进行中",
    },
  ],
  boards: [{ id: "b-1", name: "产品迭代 v1.0", team_id: "t-1", team_name: "Demo 产品团队" }],
};

test("flattenHits: 任务在前看板在后，并生成正确深链与面包屑", () => {
  const items = flattenHits(RESULT);
  assert.deepEqual(items.map((i) => i.kind), ["task", "board"]);
  assert.equal(items[0].href, "/boards/b-1?task=tk-1");
  assert.equal(items[0].subtitle, "Demo 产品团队 / 产品迭代 v1.0 / 进行中");
  assert.equal(items[1].href, "/boards/b-1");
  assert.deepEqual(flattenHits(null), []);
  assert.deepEqual(flattenHits(undefined), []);
  assert.deepEqual(flattenHits({ query: "", tasks: [], boards: [] }), []);
});

test("帮助面板真值表与实现一致", () => {
  assert.equal(QUICK_ADD_EVENT, "collab:quick-add");
  assert.deepEqual([...SHORTCUTS.map((s) => s.action)].sort(), ["help", "palette", "quick-add"]);
});
