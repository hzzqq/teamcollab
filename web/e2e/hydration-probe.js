/* hydration-probe.js —— 非 minified 环境抓 React hydration 完整组件栈（诊断工具，非门禁）
 *
 * 背景：CI 曾偶发在 subtasks-e2e 的 no_page_runtime_errors 里捕获
 * `Minified React error #418`，生产 build 只给一行 minified 消息，无法定位组件。
 * 本脚本在 `next dev`（非 minified）下跑 N 轮，把 console.error 全文 + location +
 * pageerror 完整 stack + 触发 URL 全量打印，用于定点定位具体组件。
 *
 * 用法（CI 手动 job hydration-probe 会设置好这些环境变量）：
 *   E2E_BASE=http://127.0.0.1:3002 E2E_API=http://127.0.0.1:8000 PROBE_ROUNDS=10 \
 *     NODE_PATH=<playwright-core 所在 node_modules> node web/e2e/hydration-probe.js
 *
 * 退出码恒为 0：这是诊断工具，不把偶发问题变成门禁红灯。
 * 命中的完整信息同时写入 PROBE_OUT（若指定），供 CI 归档 artifact。
 */
const { chromium: chromiumCore } = require("playwright-core");
const fs = require("fs");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const BASE = process.env.E2E_BASE || "http://127.0.0.1:3000";
const API = process.env.E2E_API || "http://127.0.0.1:8000";
const ROUNDS = Math.max(1, Number(process.env.PROBE_ROUNDS || 10));
const PROBE_OUT = process.env.PROBE_OUT || "";
// next dev 首次访问页面要现编译，超时上限比生产 E2E 放宽
const NAV = { waitUntil: "domcontentloaded", timeout: Number(process.env.NAV_TIMEOUT || 60000) };

/** 与 mainline-e2e.js 同款：本机优先系统 Edge，CI 回退 playwright 自带 chromium */
async function launchBrowser() {
  const args = ["--no-sandbox", "--disable-gpu", "--no-proxy-server", "--window-size=1440,900"];
  if (fs.existsSync(EDGE)) {
    return chromiumCore.launch({ executablePath: EDGE, headless: true, args });
  }
  const { chromium } = require("playwright");
  return chromium.launch({ headless: true, args });
}
const HYDRATION_RE =
  /hydrat|did not match|React error #4\d\d|Text content does not match|server rendered HTML|Prop `.*` did not match/i;

const lines = [];
function say(s) {
  console.log(s);
  lines.push(s);
}

async function api(route, opts = {}) {
  const res = await fetch(`${API}${route}`, opts);
  const json = await res.json();
  if (!res.ok || json.code !== 0) {
    throw new Error(`${route} -> HTTP ${res.status} code=${json.code} msg=${json.message}`);
  }
  return json.data;
}

async function makeFixture(round) {
  const ts = `${Date.now()}-${round}`;
  const email = `probe-${ts}@test.com`;
  const password = "pass1234";
  await api("/api/v1/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, display_name: "HydrationProbe" }),
  });
  const loginRes = await fetch(`${API}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username: email, password }),
  });
  const token = (await loginRes.json()).data.access_token;
  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const post = (route, body) =>
    api(route, { method: "POST", headers: auth, body: JSON.stringify(body) });
  const me = await api("/api/v1/me", { headers: auth });
  const board = await post(`/api/v1/teams/${me.team.id}/boards`, { name: `probe 看板 ${ts}` });
  const col = await post(`/api/v1/boards/${board.id}/columns`, { name: "待办", position: 0 });
  const task = await post(`/api/v1/boards/${board.id}/tasks`, {
    title: `probe 任务 ${ts}`,
    column_id: col.id,
  });
  return { email, password, boardId: board.id, taskId: task.id, teamId: me.team.id };
}

(async () => {
  const browser = await launchBrowser();

  let hitRounds = 0;
  let hydrationHits = 0;
  const allFindings = [];

  try {
    for (let round = 1; round <= ROUNDS; round += 1) {
      const fixture = await makeFixture(round);
      // 每轮独立 context：localStorage / 主题 / 缓存全部干净，避免轮次间污染
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      const findings = [];
      const record = (kind, text, extra) => {
        findings.push(`[${kind}] ${text}${extra ? `\n    ${extra}` : ""}\n    @ ${page.url()}`);
      };
      // React 非 minified 的 hydration 报错常把组件树放在 console.error 的第 2+ 个参数里，
      // m.text() 只有拼接摘要，故异步把 args 序列化后回填到同一条 finding 上。
      page.on("console", (m) => {
        if (m.type() !== "error") return;
        const loc = m.location();
        const idx = findings.push(
          `[console.error] ${m.text()}\n    location=${loc.url}:${loc.lineNumber}:${loc.columnNumber}\n    @ ${page.url()}`
        ) - 1;
        Promise.all(m.args().map((a) => a.jsonValue().catch(() => "<unserializable>")))
          .then((args) => {
            if (!args.length) return;
            const dump = JSON.stringify(args, null, 2).slice(0, 8000);
            findings[idx] += `\n    args=${dump}`;
          })
          .catch(() => {});
      });
      page.on("pageerror", (e) => record("pageerror", e.message, (e.stack || "").split("\n").slice(0, 12).join("\n    ")));

      try {
        await page.goto(`${BASE}/login`, NAV);
        await page.fill("#email", fixture.email);
        await page.fill("#password", fixture.password);
        await Promise.all([
          page.waitForURL("**/me/tasks", { timeout: 20000 }),
          page.click('button[type="submit"]'),
        ]);
        await page.waitForTimeout(700);
        // 与 subtasks-e2e 相同的两条渲染路径：列表视图 + 任务详情抽屉深链
        await page.goto(`${BASE}/boards/${fixture.boardId}?view=list`, NAV);
        await page.waitForTimeout(900);
        await page.goto(`${BASE}/boards/${fixture.boardId}?task=${fixture.taskId}`, NAV);
        await page.waitForTimeout(900);
        // 扩覆盖：其它 (app) 路由（同一 context，/me 已热缓存，复现缓存命中首帧场景）
        await page.goto(`${BASE}/boards`, NAV);
        await page.waitForTimeout(900);
        await page.goto(`${BASE}/projects`, NAV);
        await page.waitForTimeout(900);
        await page.goto(`${BASE}/teams/${fixture.teamId}/members`, NAV);
        await page.waitForTimeout(900);
        await page.goto(`${BASE}/teams/${fixture.teamId}/settings`, NAV);
        await page.waitForTimeout(900);
        await page.goto(`${BASE}/admin`, NAV);
        await page.waitForTimeout(900);
      } catch (e) {
        record("probe-navigation", `导航失败: ${e.message}`, "");
      }
      await page.waitForTimeout(800); // 等异步 console args 序列化回填完成再判定

      const hits = findings.filter((f) => HYDRATION_RE.test(f));
      hydrationHits += hits.length;
      if (hits.length) hitRounds += 1;
      allFindings.push({ round, findings });
      say(`=== ROUND ${round}/${ROUNDS} === console.error/pageerror=${findings.length} hydration=${hits.length}`);
      if (hits.length) hits.slice(0, 3).forEach((h) => say(h));
      await context.close();
    }
  } finally {
    await browser.close();
  }

  say("\n=== SUMMARY ===");
  say(`base=${BASE} rounds=${ROUNDS} hit_rounds=${hitRounds} hydration_errors=${hydrationHits}`);
  if (hydrationHits > 0) {
    say("--- 完整诊断（含组件栈，用于定点修复）---");
    for (const r of allFindings) {
      if (!r.findings.some((f) => HYDRATION_RE.test(f))) continue;
      say(`\n[ROUND ${r.round}]`);
      r.findings.slice(0, 12).forEach((f) => say(f));
    }
  } else {
    say("未复现 hydration 错误：本次样本下 SSR/CSR 一致。偶发问题需增加轮次或换环境重试。");
    say("说明：未复现不等于已根治，本工具的价值在于复发时给出完整组件栈。");
  }
  // 非 hydration 的运行时错误也要留痕：可能是环境噪音（SSE 断开、404），
  // 也可能正是偶发问题的前兆。只展示前 5 条并截断，避免淹没报告。
  const other = [];
  for (const r of allFindings) {
    for (const f of r.findings) {
      if (!HYDRATION_RE.test(f)) other.push(`[ROUND ${r.round}] ${f.slice(0, 700)}`);
    }
  }
  if (other.length) {
    say(`\n--- 非 hydration 运行时错误（共 ${other.length} 条，展示前 5 条）---`);
    other.slice(0, 5).forEach((f) => say(f));
  }
  if (PROBE_OUT) {
    fs.mkdirSync(require("path").dirname(PROBE_OUT), { recursive: true });
    fs.writeFileSync(PROBE_OUT, lines.join("\n") + "\n", "utf8");
    console.log(`诊断报告已写入 ${PROBE_OUT}`);
  }
})().catch((e) => {
  console.error("PROBE ERROR:", e.stack || e.message);
  process.exit(1);
});
