/* 批次 4C「多层级子任务」可视化 E2E（真实浏览器 + 真实前后端）
 *
 * 与 task-detail-e2e.js 的分工（勿重复）：
 *   - task-detail-e2e 覆盖 3a 的单层 checklist（新子任务内容 / 增 / 勾选 / 删 / 复制保留）
 *   - 本脚本覆盖 4C 新增能力：parent_id 树状多层级、抽屉层级跳转、列表视图 subtask_count 列
 *
 * 数据全部由真实 API 现场创建（自带唯一时间戳账号/看板，可重复跑，不依赖 seed 的 pm@example.com）。
 * 浏览器侧只验证 UI 呈现与交互，避免依赖卡片 DOM 细节。
 *
 * 坑：抽屉里有两个 aria-label="添加子任务" 的按钮（3a checklist 表单 + 4C 层级表单），
 *     必须用 form:has(input[aria-label="新子任务标题"]) 精确定位，否则 Playwright strict mode 报错。
 *
 * 浏览器选择：本机优先系统 Edge（playwright-core），CI 无 Edge 时回退 playwright 自带 chromium。
 * 运行：NODE_PATH=<.pgtmp/pw/node_modules> node web/e2e/subtasks-e2e.js
 */
const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const BASE = process.env.E2E_BASE || "http://127.0.0.1:3000";
const API = process.env.E2E_API || "http://127.0.0.1:8000";
const SHOT_DIR = process.env.SHOT_DIR || path.join(__dirname, "shots");
const NAV = { waitUntil: "domcontentloaded", timeout: 20000 };

const TS = Date.now();
const EMAIL = `subtasks-${TS}@test.com`;
const PASSWORD = "pass1234";
const PARENT = `层级父任务 ${TS}`;
const CHILD_A = `子任务A ${TS}`;
const CHILD_B = `子任务B ${TS}`;
const GRAND = `孙任务A1 ${TS}`;
const NEW_GRAND = `孙任务A2 ${TS}`;

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
}

async function api(route, opts = {}) {
  const res = await fetch(`${API}${route}`, opts);
  const json = await res.json();
  if (!res.ok || json.code !== 0) {
    throw new Error(`${route} -> HTTP ${res.status} code=${json.code} msg=${json.message}`);
  }
  return json.data;
}

/** 用真实 API 造三层数据：父 -> 子A/子B -> 孙A1（挂在子A下） */
async function setupHierarchy() {
  await api("/api/v1/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, display_name: "层级E2E" }),
  });
  const loginRes = await fetch(`${API}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username: EMAIL, password: PASSWORD }),
  });
  const token = (await loginRes.json()).data.access_token;
  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const post = (route, body) => api(route, { method: "POST", headers: auth, body: JSON.stringify(body) });

  const me = await api("/api/v1/me", { headers: auth });
  const board = await post(`/api/v1/teams/${me.team.id}/boards`, { name: `层级看板 ${TS}` });
  const col = await post(`/api/v1/boards/${board.id}/columns`, { name: "待办", position: 0 });
  const parent = await post(`/api/v1/boards/${board.id}/tasks`, { title: PARENT, column_id: col.id });
  const childA = await post(`/api/v1/tasks/${parent.id}/subtasks`, { title: CHILD_A });
  const childB = await post(`/api/v1/tasks/${parent.id}/subtasks`, { title: CHILD_B });
  const grand = await post(`/api/v1/tasks/${childA.id}/subtasks`, { title: GRAND });
  return { boardId: board.id, parentId: parent.id, childAId: childA.id, childBId: childB.id, grandId: grand.id };
}

async function login(page) {
  await page.goto(`${BASE}/login`, NAV);
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await Promise.all([
    page.waitForURL("**/me/tasks", { timeout: 15000 }),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForTimeout(800);
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const data = await setupHierarchy();
  check("api_hierarchy_3_levels_created", Boolean(data.parentId && data.childAId && data.grandId));

  const launchOpts = {
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--no-proxy-server", "--window-size=1440,900"],
  };
  if (fs.existsSync(EDGE)) launchOpts.executablePath = EDGE;
  const browser = await chromium.launch(launchOpts);

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    const errorDetails = [];
    const isHydrationError = (text) =>
      /React error #4\d\d|Hydration failed|Text content does not match|server rendered HTML/i.test(text);
    page.on("pageerror", (e) => {
      errors.push(e.message);
      errorDetails.push(
        `[pageerror] ${e.message}\n${(e.stack || "").split("\n").slice(0, 6).join("\n")}`,
      );
    });
    page.on("console", (m) => {
      if (m.type() !== "error") return;
      const text = m.text();
      // 全量留痕（含触发 URL），但只有 hydration / React 运行时错误计入断言：
      // favicon 404 之类的噪音不该让断言变严、制造新的偶发失败。
      errorDetails.push(`[console.error] ${text} @ ${page.url()}`);
      if (isHydrationError(text)) errors.push(text);
    });
    await login(page);

    /* ---------- A. 列表视图 subtask_count 列（4C 新增） ---------- */
    await page.goto(`${BASE}/boards/${data.boardId}?view=list`, NAV);
    await page.waitForTimeout(1200);
    const rows = page.locator('[data-testid="task-row"]');
    check("list_view_rows_rendered", (await rows.count()) > 0, `rows=${await rows.count()}`);
    const parentRow = rows.filter({ hasText: PARENT }).first();
    check("parent_row_found", (await parentRow.count()) === 1);
    // task-table.tsx 渲染 title="${subtask_count} 个下属子任务"，只统计直接子任务
    check("parent_subtask_count_is_2", (await parentRow.locator('[title="2 个下属子任务"]').count()) === 1);

    /* ---------- B. 抽屉「子任务（层级）」区块只列直接子级 ---------- */
    await page.goto(`${BASE}/boards/${data.boardId}?task=${data.parentId}`, NAV);
    const drawer = page.locator('div[role="dialog"][aria-label="任务详情"]');
    await drawer.waitFor({ timeout: 10000 });
    await page.waitForTimeout(900);
    let text = (await drawer.textContent()) || "";
    check("drawer_opens_via_deeplink", text.includes(PARENT));
    check("hierarchy_section_present", text.includes("子任务（层级）"));
    check("direct_children_listed", text.includes(CHILD_A) && text.includes(CHILD_B) && text.includes("0/2 已完成"));
    check("grandchild_hidden_in_parent_drawer", !text.includes(GRAND));

    /* ---------- C. 点子任务标题下钻一层（多层级核心） ---------- */
    await drawer.getByRole("button", { name: CHILD_A, exact: true }).click();
    await page.waitForTimeout(1200);
    check("child_drawer_opened", page.url().includes(data.childAId), page.url().slice(-60));
    text = (await drawer.textContent()) || "";
    check("child_drawer_shows_grandchild", text.includes(GRAND));
    check("child_hierarchy_count_0_1", text.includes("0/1 已完成"));

    /* ---------- D. UI 增 / 勾选 / 删（4C 表单，避开同名单层 checklist 按钮） ---------- */
    const hierarchyForm = drawer.locator('form:has(input[aria-label="新子任务标题"])');
    await hierarchyForm.locator('input[aria-label="新子任务标题"]').fill(NEW_GRAND);
    await hierarchyForm.locator('button[aria-label="添加子任务"]').click();
    await page.waitForTimeout(1100);
    text = (await drawer.textContent()) || "";
    check("ui_add_grandchild", text.includes(NEW_GRAND));
    check("hierarchy_count_becomes_0_2", text.includes("0/2 已完成"));

    await drawer.locator(`[aria-label="标记 ${NEW_GRAND} 完成"]`).click();
    await page.waitForTimeout(1000);
    text = (await drawer.textContent()) || "";
    check("toggle_marks_done_1_2", text.includes("1/2 已完成"));

    await drawer.locator(`[aria-label="删除子任务 ${NEW_GRAND}"]`).click();
    await page.waitForTimeout(1000);
    text = (await drawer.textContent()) || "";
    check("delete_removes_grandchild", !text.includes(NEW_GRAND));

    check("no_page_runtime_errors", errors.length === 0, errors.slice(0, 2).join(" | "));
    if (errors.length) {
      // CI 上偶发 React #418 时，把完整堆栈 + URL 打出来，下次能直接定点定位
      console.log("\n--- 运行时错误诊断（定位偶发 hydration mismatch）---");
      errorDetails.slice(0, 8).forEach((d) => console.log(d));
    }
    await page.screenshot({ path: path.join(SHOT_DIR, "subtasks.png"), animations: "disabled" });
    await page.close();
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\nTOTAL ${results.length}  PASS ${results.length - failed.length}  FAIL ${failed.length}`);
  if (failed.length) process.exit(1);
})().catch((e) => {
  console.error("E2E ERROR:", e.message);
  process.exit(1);
});
