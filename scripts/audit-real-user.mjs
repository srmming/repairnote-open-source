import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const outDir = path.resolve("screenshots/audit-real-user");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");

const routes = [
  { name: "维修单", hash: "/dashboard/repairs", heading: "维修单", must: ["新增", "搜索", "全部状态"] },
  { name: "保修单", hash: "/dashboard/warranties", heading: "保修单", must: ["搜索", "全部状态", "原维修单号"] },
  { name: "客户", hash: "/dashboard/clients", heading: "客户", must: ["新增", "搜索"] },
  { name: "品牌型号", hash: "/dashboard/categories", heading: "品牌 / 型号", must: ["新增品牌", "搜索", "新增型号"] },
  { name: "配件", hash: "/dashboard/modules", heading: "配件", must: ["新增", "搜索"] },
  { name: "服务", hash: "/dashboard/services", heading: "服务", must: ["新增", "搜索"] },
  { name: "属性", hash: "/dashboard/attributes", heading: "属性", must: ["新增", "搜索"] },
  { name: "员工", hash: "/dashboard/staff", heading: "员工", must: ["新增", "搜索"] },
  { name: "维修师", hash: "/dashboard/technicians", heading: "维修师", must: ["新增", "搜索"] },
  { name: "报表", hash: "/dashboard/reports", heading: "报表", must: ["维修单数量", "未收款"] },
  { name: "设置", hash: "/dashboard/settings", heading: "设置", must: ["联系电话", "维修条款"] },
  { name: "备份", hash: "/dashboard/backup", heading: "备份", must: ["导出数据库 JSON", "导入 JSON", "导入旧 localStorage"] },
  { name: "新增维修单", hash: "/dashboard/repairs/new", heading: "维修单 编辑", must: ["客户信息", "维修信息", "维修师", "打印小票", "打印 A4", "二维码进度页"] }
];

const viewports = [
  { name: "desktop", width: 1366, height: 900 },
  { name: "mobile", width: 390, height: 844, isMobile: true, hasTouch: true }
];

const results = [];
const errors = [];

function issue(viewport, pageName, message) {
  results.push({ viewport, page: pageName, ok: false, message });
}

function ok(viewport, pageName, message) {
  results.push({ viewport, page: pageName, ok: true, message });
}

async function login(page) {
  await page.goto(baseUrl);
  await page.getByPlaceholder("账号").fill("ming");
  await page.getByPlaceholder("密码").fill("123456");
  await page.getByRole("button", { name: "登录" }).click();
  await Promise.race([
    page.getByRole("heading", { name: "维修单" }).waitFor(),
    page.getByRole("heading", { name: "Reparaciones" }).waitFor()
  ]);
  if (await page.getByRole("heading", { name: "Reparaciones" }).count()) {
    await page.locator(".sidebar-bottom .ui-select").click();
    await page.getByRole("listbox").getByRole("button", { name: "中文" }).click();
  }
  await page.getByRole("heading", { name: "维修单" }).waitFor();
}

async function checkRoute(page, viewport, route) {
  await page.goto(`${baseUrl}#${route.hash}`);
  await page.getByRole("heading", { name: route.heading }).first().waitFor({ timeout: 10000 });
  await page.screenshot({ path: path.join(outDir, `${stamp}-${viewport.name}-${route.name}.png`), fullPage: true });

  const state = await page.evaluate(() => {
    const fieldText = [...document.querySelectorAll("input, textarea, select")]
      .map((node) => [
        node.getAttribute("placeholder"),
        node.getAttribute("aria-label"),
        node.value,
        node.selectedOptions?.[0]?.textContent
      ].filter(Boolean).join(" "))
      .join("\n");
    const text = [document.body.innerText, fieldText].join("\n");
    const main = document.querySelector("main");
    const active = document.activeElement;
    const rects = [...document.querySelectorAll("body *")]
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return { tag: node.tagName, text: (node.innerText || node.getAttribute("aria-label") || "").trim().slice(0, 80), right: rect.right, width: rect.width, display: getComputedStyle(node).display };
      })
      .filter((item) => item.width > 0 && item.right > window.innerWidth + 2)
      .slice(0, 8);
    return {
      text,
      bodyHeight: document.body.scrollHeight,
      viewportHeight: window.innerHeight,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
      overflowNodes: rects,
      activeTag: active?.tagName || "",
      mainTextLength: main?.innerText?.trim().length || 0
    };
  });

  if (state.mainTextLength < 10) issue(viewport.name, route.name, "主内容区接近空白");
  else ok(viewport.name, route.name, "主内容区有内容");

  for (const text of route.must) {
    if (!state.text.includes(text)) issue(viewport.name, route.name, `缺少关键入口或文案：${text}`);
    else ok(viewport.name, route.name, `包含：${text}`);
  }

  if (state.horizontalOverflow) {
    issue(viewport.name, route.name, `页面存在横向溢出：${JSON.stringify(state.overflowNodes)}`);
  } else {
    ok(viewport.name, route.name, "无横向溢出");
  }
}

await mkdir(outDir, { recursive: true });

for (const viewport of viewports) {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: Boolean(viewport.isMobile),
    hasTouch: Boolean(viewport.hasTouch)
  });
  const page = await context.newPage();
  page.on("console", (msg) => {
    if (["error", "warning"].includes(msg.type())) errors.push({ viewport: viewport.name, type: msg.type(), text: msg.text() });
  });
  page.on("pageerror", (error) => errors.push({ viewport: viewport.name, type: "pageerror", text: error.message }));
  await login(page);
  for (const route of routes) {
    try {
      await checkRoute(page, viewport, route);
    } catch (error) {
      issue(viewport.name, route.name, error.message);
    }
  }
  await browser.close();
}

const failed = results.filter((item) => !item.ok);
const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  screenshotDir: outDir,
  summary: { checks: results.length, failed: failed.length, consoleIssues: errors.length },
  failed,
  consoleIssues: errors.slice(0, 50),
  results
};

await writeFile(path.join(outDir, `${stamp}-report.json`), JSON.stringify(report, null, 2));

console.log(`REPORT ${path.join(outDir, `${stamp}-report.json`)}`);
console.log(`CHECKS ${results.length}`);
console.log(`FAILED ${failed.length}`);
for (const item of failed) {
  console.log(`FAIL ${item.viewport} ${item.page} - ${item.message}`);
}
if (errors.length) {
  console.log(`CONSOLE_ISSUES ${errors.length}`);
  for (const item of errors.slice(0, 12)) console.log(`${item.type} ${item.viewport} - ${item.text}`);
}

if (failed.length || errors.length) process.exitCode = 1;
