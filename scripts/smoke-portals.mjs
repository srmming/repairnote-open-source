#!/usr/bin/env node
// 浏览器冒烟（Playwright）：从网页完整走一遍
//   系统主管理员登录 → 设置 → 门户管理 → 新建第二门户 → 分配已有账号 → 该账号登录选择门户 → 改权限 → 停用拒绝业务 → 重新启用数据不丢
// 以及：普通门店管理员看不到门户管理、无门户系统管理员直接进入管理页、双标签页各自门户、临时错误不假登出、窄屏布局。
// 需要：REPAIRNOTE_TEST_BASE_URL、REPAIRNOTE_TEST_DATABASE_URL（_test 结尾）、REPAIRNOTE_ALLOW_DESTRUCTIVE_TESTS=true。截图写入 reports/screenshots/。
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE_URL = (process.env.REPAIRNOTE_TEST_BASE_URL || "").replace(/\/$/, "");
const DB_URL = process.env.REPAIRNOTE_TEST_DATABASE_URL || "";
if (!BASE_URL || !DB_URL || !/_test(\?|$)/.test(new URL(DB_URL).pathname) || process.env.REPAIRNOTE_ALLOW_DESTRUCTIVE_TESTS !== "true") {
  console.error("✗ 需要 REPAIRNOTE_TEST_BASE_URL、以 _test 结尾的 REPAIRNOTE_TEST_DATABASE_URL 与 REPAIRNOTE_ALLOW_DESTRUCTIVE_TESTS=true");
  process.exit(2);
}
const prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });
const PASSWORD = "Smoke-Pass-2026!";
const PAGE_KEYS = ["repairs", "clients", "categories", "modules", "services", "attributes", "technicians", "reports", "finance", "settings", "backup"];
const shotsDir = path.join(root, "reports", "screenshots");
fs.mkdirSync(shotsDir, { recursive: true });
const results = [];

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  return `${salt}:${crypto.scryptSync(String(password), salt, 64).toString("hex")}`;
}

async function step(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail: detail || "" });
    console.log(`PASS ${name}${detail ? ` — ${detail}` : ""}`);
  } catch (error) {
    results.push({ name, ok: false, detail: error?.message || String(error) });
    console.log(`FAIL ${name} — ${error?.message || error}`);
  }
}

async function reset() {
  await prisma.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 0");
  for (const table of ["Payment", "RepairItem", "Repair", "Attribute", "AttributeGroup", "Model", "Brand", "Part", "Service", "Technician", "Client", "BackupSnapshot", "Setting", "PortalMember", "Portal", "StaffSession", "Staff"]) {
    await prisma.$executeRawUnsafe(`DELETE FROM \`${table}\``);
  }
  await prisma.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 1");
  await prisma.portal.create({ data: { id: "default", name: "A 测试门户", revision: 1n, setting: { create: { value: { shopName: "A 店", uiLanguage: "zh" } } } } });
  await prisma.staff.create({ data: { id: "sys1", name: "系统主管理员", username: "sysadmin", email: "", passwordHash: hashPassword(PASSWORD), isSystemAdmin: true, memberships: { create: { portalId: "default", isAdmin: true, pagePermissions: PAGE_KEYS } } } });
  await prisma.staff.create({ data: { id: "shop-admin", name: "门店管理员", username: "shop-admin", email: "", passwordHash: hashPassword(PASSWORD), memberships: { create: { portalId: "default", isAdmin: true, pagePermissions: PAGE_KEYS } } } });
  await prisma.staff.create({ data: { id: "worker", name: "员工小王", username: "worker", email: "", passwordHash: hashPassword(PASSWORD), memberships: { create: { portalId: "default", isAdmin: false, pagePermissions: ["repairs", "clients"] } } } });
  await prisma.staff.create({ data: { id: "sys-empty", name: "无门户系统管理员", username: "sys-empty", email: "", passwordHash: hashPassword(PASSWORD), isSystemAdmin: true } });
}

async function login(page, username) {
  await page.goto(`${BASE_URL}/#/login`);
  await page.getByPlaceholder("账号").fill(username);
  await page.getByPlaceholder("密码").fill(PASSWORD);
  await page.getByRole("button", { name: "登录" }).click();
}

async function ensureChinese(page) {
  if (await page.getByRole("heading", { name: "维修单" }).count()) return;
  if (await page.getByRole("heading", { name: "Reparaciones" }).count()) {
    await page.locator(".sidebar-bottom .ui-select").click();
    await page.getByRole("listbox").getByRole("button", { name: "中文" }).click();
    await page.getByRole("heading", { name: "维修单" }).waitFor();
  }
}

async function waitWorkspace(page) {
  await Promise.race([
    page.getByRole("heading", { name: "维修单" }).waitFor({ timeout: 15000 }),
    page.getByRole("heading", { name: "Reparaciones" }).waitFor({ timeout: 15000 })
  ]);
  await ensureChinese(page);
}

await reset();
// 本地默认用已安装的 Chrome；CI 用 Playwright 自带的 Chromium（SMOKE_BROWSER_CHANNEL=bundled）。
const channel = process.env.SMOKE_BROWSER_CHANNEL || "chrome";
const browser = await chromium.launch({ ...(channel === "bundled" ? {} : { channel }), headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const page = await context.newPage();
page.on("dialog", (dialog) => dialog.accept());
page.setDefaultTimeout(15000);
let portalBId = "";

await step("系统主管理员登录：唯一门户自动进入工作区，侧栏显示当前门户名", async () => {
  await login(page, "sysadmin");
  await waitWorkspace(page);
  if (!page.url().includes("#/p/default/")) throw new Error(`URL 未带门户前缀：${page.url()}`);
  await page.locator(".portal-switch-name", { hasText: "A 测试门户" }).waitFor();
  await page.screenshot({ path: path.join(shotsDir, "01-workspace-desktop.png") });
});

await step("设置页显示“门户管理”入口并进入 /#/settings/portals", async () => {
  await page.goto(`${BASE_URL}/#/p/default/dashboard/settings`);
  await page.getByRole("button", { name: "打开门户管理" }).click();
  await page.getByRole("heading", { name: "门户管理", exact: true }).waitFor();
  if (!page.url().endsWith("#/settings/portals")) throw new Error(`管理路由不正确：${page.url()}`);
  await page.locator("tr", { hasText: "A 测试门户" }).waitFor();
  await page.screenshot({ path: path.join(shotsDir, "02-portal-management.png") });
});

await step("新建第二门户：只填名称，列表出现新门户（启用、成员 1）", async () => {
  await page.getByRole("button", { name: "新增门户" }).click();
  await page.getByPlaceholder("门户名称（1–80 个字符）").fill("第二门户");
  await page.getByRole("button", { name: "创建", exact: true }).click();
  const row = page.locator("tr", { hasText: "第二门户" });
  await row.waitFor();
  const portal = await prisma.portal.findFirst({ where: { name: "第二门户" } });
  if (!portal) throw new Error("数据库无新门户");
  portalBId = portal.id;
  const setting = await prisma.setting.findUnique({ where: { portalId: portal.id } });
  const members = await prisma.portalMember.count({ where: { portalId: portal.id } });
  if (!setting || members !== 1 || portal.revision !== 1n) throw new Error(`新门户状态异常 setting=${Boolean(setting)} members=${members} rev=${portal.revision}`);
  await page.screenshot({ path: path.join(shotsDir, "03-portal-created.png") });
  return `id=${portal.id}`;
});

await step("分配已有账号 worker 到第二门户（普通员工 + 维修单权限）；不存在账号提示先创建", async () => {
  const row = page.locator("tr", { hasText: "第二门户" });
  await row.getByRole("button", { name: "分配账号" }).click();
  const dialog = page.locator('[role="dialog"]');
  await dialog.getByPlaceholder("输入完整用户名").fill("ghost-user");
  await dialog.getByRole("button", { name: "查找" }).click();
  await dialog.getByText("账号不存在，请先在现有员工页面创建账号").waitFor();
  await dialog.getByPlaceholder("输入完整用户名").fill("worker");
  await dialog.getByRole("button", { name: "查找" }).click();
  await dialog.locator(".portal-member-selected", { hasText: "worker" }).waitFor();
  await dialog.getByLabel("维修单").check();
  await page.screenshot({ path: path.join(shotsDir, "04-assign-member.png") });
  await dialog.getByRole("button", { name: "保存分配" }).click();
  await dialog.locator(".portal-member-item", { hasText: "worker" }).waitFor();
  const member = await prisma.portalMember.findUnique({ where: { staffId_portalId: { staffId: "worker", portalId: portalBId } } });
  if (!member || member.isAdmin || member.pagePermissions.join(",") !== "repairs") throw new Error(`成员关系不正确 ${JSON.stringify(member)}`);
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
});

const workerContext = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const workerPage = await workerContext.newPage();
workerPage.on("dialog", (dialog) => dialog.accept());
workerPage.setDefaultTimeout(15000);

await step("worker 登录：两个门户 → 门户选择页；进入第二门户后工作区显示其名称；看不到系统入口", async () => {
  await login(workerPage, "worker");
  await workerPage.getByRole("heading", { name: "选择门户" }).waitFor();
  await workerPage.locator(".portal-list-item", { hasText: "A 测试门户" }).waitFor();
  await workerPage.screenshot({ path: path.join(shotsDir, "05-portal-picker.png") });
  if (await workerPage.getByRole("button", { name: "门户管理" }).count()) throw new Error("普通用户不应看到门户管理");
  await workerPage.locator(".portal-list-item", { hasText: "第二门户" }).click();
  await waitWorkspace(workerPage);
  await workerPage.locator(".portal-switch-name", { hasText: "第二门户" }).waitFor();
  if (!workerPage.url().includes(`#/p/${portalBId}/`)) throw new Error(`URL ${workerPage.url()}`);
  if (await workerPage.getByText("门户管理").count()) throw new Error("普通员工不应看到门户管理");
  if (await workerPage.locator(".sidebar").getByText("设置", { exact: true }).count()) throw new Error("无 settings 权限不应显示设置");
});

await step("双标签页：同账号 A 门户与第二门户各自独立，互不跳店", async () => {
  const second = await workerContext.newPage();
  await second.goto(`${BASE_URL}/#/p/default/dashboard/repairs`);
  await waitWorkspace(second);
  await second.locator(".portal-switch-name", { hasText: "A 测试门户" }).waitFor();
  await workerPage.reload();
  await waitWorkspace(workerPage);
  await workerPage.locator(".portal-switch-name", { hasText: "第二门户" }).waitFor();
  await second.close();
});

await step("系统管理员修改 worker 在第二门户的权限（加客户），worker 刷新后侧栏出现“客户”", async () => {
  await page.reload();
  await page.getByRole("heading", { name: "门户管理", exact: true }).waitFor();
  const row = page.locator("tr", { hasText: "第二门户" });
  await row.getByRole("button", { name: "分配账号" }).click();
  const dialog = page.locator('[role="dialog"]');
  await dialog.locator(".portal-member-item", { hasText: "worker" }).getByRole("button", { name: "编辑" }).click();
  await dialog.getByLabel("客户").check();
  await dialog.getByRole("button", { name: "保存分配" }).click();
  await dialog.locator(".portal-member-item", { hasText: "客户" }).waitFor();
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  await workerPage.reload();
  await waitWorkspace(workerPage);
  await workerPage.locator(".sidebar").getByText("客户", { exact: true }).first().waitFor();
});

await step("停用第二门户（有确认）：worker 下一次请求被拒并回到门户选择；数据保留", async () => {
  await prisma.client.create({ data: { id: "b-client-keep", portalId: portalBId, name: "Keep Me", phone: "699000111", address: "", comment: "" } });
  const row = page.locator("tr", { hasText: "第二门户" });
  await row.getByRole("button", { name: "停用" }).click();
  await page.locator("tr", { hasText: "第二门户" }).getByText("停用", { exact: true }).first().waitFor();
  await page.locator("tr", { hasText: "第二门户" }).getByRole("button", { name: "启用" }).waitFor();
  await workerPage.reload();
  await workerPage.getByRole("heading", { name: "选择门户" }).waitFor({ timeout: 20000 });
  if (await workerPage.locator(".portal-list-item", { hasText: "第二门户" }).count()) throw new Error("停用门户仍可选择");
  const kept = await prisma.client.count({ where: { portalId: portalBId } });
  if (kept !== 1) throw new Error("停用后数据丢失");
  await page.screenshot({ path: path.join(shotsDir, "06-portal-disabled.png") });
});

await step("重新启用第二门户：worker 可再次进入，数据不丢", async () => {
  await page.locator("tr", { hasText: "第二门户" }).getByRole("button", { name: "启用" }).click();
  await page.locator("tr", { hasText: "第二门户" }).getByRole("button", { name: "停用" }).waitFor();
  await workerPage.reload();
  await workerPage.getByRole("heading", { name: "选择门户" }).waitFor();
  await workerPage.locator(".portal-list-item", { hasText: "第二门户" }).click();
  await waitWorkspace(workerPage);
  await workerPage.locator(".sidebar").getByText("客户", { exact: true }).first().click();
  await workerPage.getByText("Keep Me").waitFor();
});

await step("普通门店管理员：设置页无门户管理入口，直接访问管理 hash 显示无权限且无数据", async () => {
  const shopContext = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const shopPage = await shopContext.newPage();
  await login(shopPage, "shop-admin");
  await waitWorkspace(shopPage);
  await shopPage.goto(`${BASE_URL}/#/p/default/dashboard/settings`);
  await shopPage.getByRole("heading", { name: "设置" }).first().waitFor();
  if (await shopPage.getByRole("button", { name: "打开门户管理" }).count()) throw new Error("门店管理员不应看到门户管理");
  await shopPage.goto(`${BASE_URL}/#/settings/portals`);
  await shopPage.waitForTimeout(1500);
  if (await shopPage.locator("tr", { hasText: "第二门户" }).count()) throw new Error("门店管理员看到了门户列表");
  if (shopPage.url().endsWith("#/settings/portals") && !(await shopPage.getByText("没有权限").count())) throw new Error("应显示无权限或跳回工作区");
  await shopContext.close();
});

await step("无门户系统主管理员登录直接进入门户管理页，可新建门户", async () => {
  const sysContext = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const sysPage = await sysContext.newPage();
  await login(sysPage, "sys-empty");
  await sysPage.getByRole("heading", { name: "门户管理", exact: true }).waitFor();
  if (!sysPage.url().endsWith("#/settings/portals")) throw new Error(`应进入管理页：${sysPage.url()}`);
  await sysPage.getByRole("button", { name: "新增门户" }).click();
  await sysPage.getByPlaceholder("门户名称（1–80 个字符）").fill("空管理员的门户");
  await sysPage.getByRole("button", { name: "创建", exact: true }).click();
  await sysPage.locator("tr", { hasText: "空管理员的门户" }).waitFor();
  await sysContext.close();
});

await step("临时错误不假登出：bootstrap 500 后显示重试，登录仍在", async () => {
  // 所有 bootstrap 都返回 500，直到用户点“重试”为止（开发模式严格模式下 effect 会重复触发请求，不能只拦一次）
  let intercepted = 0;
  const failBootstrap = (route) => {
    intercepted += 1;
    return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "服务器错误", code: "INTERNAL_ERROR", requestId: "x" }) });
  };
  await workerPage.route("**/api/bootstrap", failBootstrap);
  await workerPage.reload();
  try {
    await workerPage.getByRole("button", { name: "重试" }).waitFor();
  } catch (error) {
    throw new Error(`未出现重试按钮（拦截 ${intercepted} 次，url=${workerPage.url()}）`);
  }
  await workerPage.unroute("**/api/bootstrap", failBootstrap);
  await workerPage.getByRole("button", { name: "重试" }).click();
  await workerPage.locator(".portal-switch-name", { hasText: "第二门户" }).waitFor();
  if (await workerPage.getByPlaceholder("账号").count()) throw new Error("重试后不应要求重新登录");
});

await step("设置页有未保存改动时切换门户 / 进入门户管理会先确认；取消后留在原页且输入保留", async () => {
  await page.goto(`${BASE_URL}/#/p/default/dashboard/settings`);
  await page.getByRole("heading", { name: "设置", exact: true }).first().waitFor();
  const shopName = page.getByPlaceholder("店铺名称").first();
  await shopName.fill("未保存的店名");
  let dialogs = 0;
  const onDialog = (dialog) => { dialogs += 1; dialog.dismiss(); };
  page.off("dialog", page.listeners("dialog")[0]);
  page.on("dialog", onDialog);
  await page.getByRole("button", { name: "打开门户管理" }).click();
  await page.waitForTimeout(800);
  if (dialogs !== 1) throw new Error(`应弹出一次未保存确认，实际 ${dialogs}`);
  if (!page.url().includes("/dashboard/settings")) throw new Error(`取消后应留在设置页：${page.url()}`);
  if ((await shopName.inputValue()) !== "未保存的店名") throw new Error("取消后输入应保留");
  await page.locator(".portal-switch-button").click();
  await page.waitForTimeout(800);
  if (dialogs !== 2) throw new Error(`切换门户也应确认，实际 ${dialogs}`);
  page.off("dialog", onDialog);
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "打开门户管理" }).click();
  await page.getByRole("heading", { name: "门户管理", exact: true }).waitFor();
});

await step("窄屏：门户选择页与门户管理页无需横向滚动", async () => {
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mobilePage = await mobile.newPage();
  await login(mobilePage, "worker");
  await mobilePage.getByRole("heading", { name: "选择门户" }).waitFor();
  const pickerWidth = await mobilePage.evaluate(() => document.documentElement.scrollWidth);
  if (pickerWidth > 390) throw new Error(`门户选择页横向溢出 ${pickerWidth}`);
  await mobilePage.screenshot({ path: path.join(shotsDir, "07-picker-mobile.png"), fullPage: true });
  await mobile.close();
  const mobileSys = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const sysPage = await mobileSys.newPage();
  await login(sysPage, "sysadmin");
  await sysPage.goto(`${BASE_URL}/#/settings/portals`);
  await sysPage.getByRole("heading", { name: "门户管理", exact: true }).waitFor();
  await sysPage.locator("tr", { hasText: "第二门户" }).waitFor();
  const width = await sysPage.evaluate(() => document.documentElement.scrollWidth);
  if (width > 390) throw new Error(`门户管理页横向溢出 ${width}`);
  await sysPage.screenshot({ path: path.join(shotsDir, "08-management-mobile.png"), fullPage: true });
  await mobileSys.close();
});

await browser.close();
await prisma.$disconnect();
const failed = results.filter((r) => !r.ok);
fs.writeFileSync(path.join(root, "reports", "smoke-portals.json"), JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
console.log(`\n${failed.length ? "✗" : "✓"} smoke-portals：通过 ${results.length - failed.length}，失败 ${failed.length}`);
process.exit(failed.length ? 1 : 0);
