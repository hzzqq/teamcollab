/* Spec §2 MVP 验收主线端到端（真实浏览器 + 真实前后端）：
   PM 注册 → 建板/列/任务 → 邀请未注册邮箱（邀请链接）→ 成员注册入队 →
   PM 分配任务+截止日期 → 成员实时收通知(SSE)→直达任务 → 成员更新状态 →
   PM 看板看到全局 + 成员我的任务聚合。
   运行前提：后端 :8000、前端 :3000（生产模式）。SSE 页禁 networkidle。

   浏览器选择（可移植）：
   - 本地 Windows：优先用系统 Edge（playwright-core + 可执行文件）
   - CI（无系统 Edge）：回退 playwright 自带 chromium（需先 npx playwright install chromium）
   截图目录：默认脚本同级的 shots/，可用 SHOT_DIR 环境变量覆盖。 */
const { chromium: chromiumCore } = require("playwright-core");
const fs = require("fs");
const path = require("path");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const BASE = "http://127.0.0.1:3000";
const SHOT_DIR = process.env.SHOT_DIR || path.join(__dirname, "shots");
const NAV = { waitUntil: "domcontentloaded", timeout: 20000 };
const TS = Date.now();
const PM_EMAIL = `pm-main-${TS}@test.com`;
const MEMBER_EMAIL = `member-main-${TS}@test.com`;
const BOARD = `主线看板${TS}`;
const TASK = `主线-发布联调${TS}`;

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
}
const shot = (page, name) =>
  page.screenshot({ timeout: 10000, animations: "disabled", path: `${SHOT_DIR}/${name}.png` }).catch(() => {});

// Radix Select 在 Playwright 下的稳定选择：选项渲染在 portal 且外层可能处于
// 开合动画中，默认 click 的可见性/稳定性检查会超时（CI 实测 step7 卡 30s）。
// 这里先滚动到位 + 强制点击 + 重试，规避动画不稳定与潜在遮挡。
async function selectRadix(page, labelLocator, optionName) {
  const combo = labelLocator.locator('[role="combobox"]');
  await combo.click();
  const opt = page.getByRole("option", { name: optionName }).first();
  await opt.waitFor({ state: "visible", timeout: 10000 });
  let ok = false;
  for (let i = 0; i < 3 && !ok; i++) {
    try {
      await opt.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
      await opt.click({ force: true, timeout: 5000 });
      ok = true;
    } catch {
      await page.waitForTimeout(400);
    }
  }
  await page.waitForTimeout(400);
}

async function launchBrowser() {
  const args = ["--no-sandbox", "--disable-gpu", "--window-size=1440,900"];
  if (fs.existsSync(EDGE)) {
    return chromiumCore.launch({ executablePath: EDGE, headless: true, args });
  }
  // CI / 无系统 Edge：回退 playwright 自带 chromium（NODE_PATH 指向 web/node_modules）
  const { chromium } = require("playwright");
  return chromium.launch({ headless: true, args });
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });

  const browser = await launchBrowser();
  const pmCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pm = await pmCtx.newPage();
  const memberCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const member = await memberCtx.newPage();

  try {
    // ===== 1. PM 注册 → 落地我的任务 =====
    await pm.goto(`${BASE}/register`, NAV);
    await pm.fill("#display-name", "主线PM");
    await pm.fill("#email", PM_EMAIL);
    await pm.fill("#password", "pass1234");
    await Promise.all([pm.waitForURL("**/me/tasks", { timeout: 20000 }), pm.click('button[type="submit"]')]);
    check("pm_register_lands_my_tasks", pm.url().includes("/me/tasks"), pm.url());

    // ===== 2. 新建看板 =====
    await pm.goto(`${BASE}/boards`, NAV);
    await pm.waitForTimeout(1500);
    await pm.getByRole("button", { name: "新建看板" }).first().click();
    await pm.getByPlaceholder("例如：产品迭代 Q3").fill(BOARD);
    await pm.getByRole("button", { name: "创建", exact: true }).click();
    await pm.waitForTimeout(1500);
    const boardLink = pm.getByRole("link", { name: new RegExp(escapeRe(BOARD)) });
    check("board_created", (await boardLink.count()) > 0);
    await shot(pm, "m1-board-created");

    // ===== 3. 建列（待办/进行中）=====
    await boardLink.first().click();
    await pm.waitForURL(/\/boards\/[0-9a-f-]{36}/, { timeout: 15000 });
    const boardUrl = pm.url();
    async function addColumn(name) {
      await pm.getByRole("button", { name: "新建列" }).click();
      await pm.getByPlaceholder("列名称").fill(name);
      await pm.getByRole("button", { name: "添加", exact: true }).click();
      await pm.waitForTimeout(800);
    }
    await addColumn("待办");
    await addColumn("进行中");
    const colText = await pm.textContent("body");
    check("columns_created", colText.includes("待办") && colText.includes("进行中"));

    // ===== 4. 待办列新建任务 =====
    await pm.getByLabel("新建任务").first().click();
    await pm.getByPlaceholder("任务标题").fill(TASK);
    await pm.getByRole("button", { name: "添加", exact: true }).click();
    await pm.waitForTimeout(1200);
    check("task_created", (await pm.getByRole("button", { name: new RegExp(escapeRe(TASK)) }).count()) > 0);

    // ===== 5. 邀请未注册邮箱 → 展示邀请链接 =====
    const memberHref = await pm.locator('a[href*="/members"]').first().getAttribute("href");
    await pm.goto(`${BASE}${memberHref}`, NAV);
    await pm.waitForTimeout(1200);
    await pm.getByPlaceholder("colleague@company.com").fill(MEMBER_EMAIL);
    await pm.getByRole("button", { name: "邀请", exact: true }).click();
    await pm.waitForSelector("text=该邮箱尚未注册", { timeout: 10000 });
    const inviteLink = (await pm.locator("code").first().textContent()) || "";
    check("invite_link_shown", /^https?:\/\/.+\/register\?invite=[0-9a-f-]{36}&email=/.test(inviteLink), inviteLink);
    await shot(pm, "m2-invite-link");

    // ===== 6. 成员经邀请链接注册 → 自动入队 =====
    await member.goto(inviteLink, NAV);
    await member.waitForTimeout(800);
    const emailVal = await member.inputValue("#email");
    check("invite_email_prefilled", emailVal === MEMBER_EMAIL, emailVal);
    const regText = await member.textContent("body");
    check("invite_banner_shown", regText.includes("你收到团队邀请"));
    await member.fill("#display-name", "主线成员");
    await member.fill("#password", "pass1234");
    await Promise.all([
      member.waitForURL("**/me/tasks", { timeout: 20000 }),
      member.click('button[type="submit"]'),
    ]);
    check("member_registered_lands_my_tasks", member.url().includes("/me/tasks"), member.url());
    await shot(member, "m3-member-my-tasks");

    // ===== 7. PM 分配负责人 + 截止日期 =====
    await pm.goto(boardUrl, NAV);
    await pm.waitForTimeout(1500);
    await pm.getByRole("button", { name: new RegExp(escapeRe(TASK)) }).first().click();
    // CSS 定位：Radix 弹层关闭时可能残留 aria-hidden，getByRole 会被 a11y 树过滤
    const drawer = pm.locator('div[role="dialog"][aria-label="任务详情"]');
    await drawer.waitFor({ timeout: 10000 });
    await pm.waitForTimeout(400); // 等抽屉开启动画稳定，避免 Radix 弹层遮挡选项
    await selectRadix(pm, drawer.locator("label", { hasText: "负责人" }), "主线成员");
    const due = new Date();
    const iso = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}`;
    await drawer.locator('input[type="date"]').fill(iso);
    await pm.waitForTimeout(1000);
    await drawer.getByRole("button", { name: "关闭" }).click();
    await pm.waitForTimeout(600);
    check("pm_assigned_task_and_due", true, `assignee=主线成员 due=${iso}`);

    // ===== 8. 成员实时收通知（SSE）→ 点通知直达任务 =====
    let realtime = true;
    try {
      await member.waitForFunction(
        () => {
          const el = document.querySelector('button[aria-label*="条未读"]');
          return el && !/0 条未读/.test(el.getAttribute("aria-label") || "");
        },
        { timeout: 15000 },
      );
    } catch {
      realtime = false;
      await member.reload(NAV);
      await member.waitForTimeout(2000);
    }
    const bell = member.locator('button[aria-label*="条未读"]').first();
    check("member_notification_received", (await bell.count()) > 0, realtime ? "SSE 实时推送" : "刷新后可见");
    await bell.click();
    await member.waitForSelector("text=你被分配了任务", { timeout: 8000 });
    await shot(member, "m4-member-notification");
    await member
      .getByRole("button", { name: new RegExp(escapeRe(`你被分配了任务「${TASK}」`)) })
      .first()
      .click();
    await member.waitForURL(/\/boards\/[0-9a-f-]{36}\?task=/, { timeout: 10000 });
    // 刷新清除通知下拉残留的弹层遮挡（同时验证 ?task= 深链接直达抽屉）
    await member.reload(NAV);
    await member.waitForTimeout(1800);
    const mDrawer = member.locator('div[role="dialog"][aria-label="任务详情"]');
    await mDrawer.waitFor({ timeout: 10000 });
    check("member_notification_navigates_to_task", true);

    // ===== 9. 成员更新状态 → 进行中 =====
    await selectRadix(member, mDrawer.locator("label", { hasText: "状态" }), "进行中");
    await member.waitForTimeout(800);
    const statusShown = await mDrawer.locator("label", { hasText: "状态" }).textContent();
    check("member_status_updated", (statusShown || "").includes("进行中"), statusShown || "");
    await shot(member, "m5-member-status-in-progress");

    // ===== 10. PM 看板看到全局（任务卡在板 + 抽屉状态=进行中）=====
    await pm.goto(boardUrl, NAV);
    await pm.waitForTimeout(1500);
    check("pm_board_shows_task", (await pm.getByRole("button", { name: new RegExp(escapeRe(TASK)) }).count()) > 0);
    await pm.getByRole("button", { name: new RegExp(escapeRe(TASK)) }).first().click();
    const pmDrawer = pm.locator('div[role="dialog"][aria-label="任务详情"]');
    await pmDrawer.waitFor({ timeout: 10000 });
    const pmStatus = (await pmDrawer.locator("label", { hasText: "状态" }).textContent()) || "";
    check("pm_sees_member_update", pmStatus.includes("进行中"), pmStatus);
    await shot(pm, "m6-pm-global-view");

    // ===== 11. 成员我的任务聚合（跨项目只看自己）=====
    await member.goto(`${BASE}/me/tasks`, NAV);
    await member.waitForTimeout(1800);
    const mt = await member.textContent("body");
    check("member_my_tasks_has_task", mt.includes(TASK), "跨项目聚合可见");
    await shot(member, "m7-member-my-tasks-final");
  } catch (e) {
    check("run_error", false, String(e).slice(0, 300));
    await shot(pm, "m-error-pm");
    await shot(member, "m-error-member");
  } finally {
    await browser.close();
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\nMAINLINE_E2E: ${passed}/${results.length} passed`);
  process.exit(results.every((r) => r.ok) ? 0 : 1);
})();
