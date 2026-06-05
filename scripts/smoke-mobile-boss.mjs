import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const smokeUsername = process.env.SMOKE_USERNAME || "ming";
const smokePassword = process.env.SMOKE_PASSWORD || "123456";
const suffix = String(Date.now()).slice(-6);
const results = [];

function ok(name) {
  results.push({ name, ok: true });
}

function fail(name, error) {
  results.push({ name, ok: false, error: error?.message || String(error) });
}

async function step(name, fn) {
  try {
    await fn();
    ok(name);
  } catch (error) {
    fail(name, error);
  }
}

async function login(page) {
  await page.goto(baseUrl);
  const entry = await Promise.race([
    page.getByPlaceholder("账号").waitFor({ timeout: 3000 }).then(() => "login").catch(() => null),
    page.getByRole("heading", { name: "维修单" }).waitFor({ timeout: 3000 }).then(() => "dashboard").catch(() => null),
    page.getByRole("heading", { name: "Reparaciones" }).waitFor({ timeout: 3000 }).then(() => "dashboard").catch(() => null)
  ]);
  if (entry === "login") {
    await page.getByPlaceholder("账号").fill(smokeUsername);
    await page.getByPlaceholder("密码").fill(smokePassword);
    await page.getByRole("button", { name: "登录" }).click();
  }
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

async function go(page, hash, heading) {
  await page.goto(`${baseUrl}#${hash}`);
  if (heading) await page.getByRole("heading", { name: heading }).first().waitFor();
}

async function ensureMobileOrder(page) {
  await go(page, "/dashboard/repairs", "维修单");
  await page.locator('[data-smoke="mobile-boss-summary"]').waitFor();
  if (await page.locator('[data-smoke="mobile-order-card"]').count() && await page.locator('[data-smoke="mobile-technician-rank-card"]').count()) return;

  await go(page, "/dashboard/repairs/new", "维修单");
  await page.getByPlaceholder("先输入客户电话搜索").fill(`688${suffix}`);
  await page.getByPlaceholder("客户姓名").fill(`老板速览${suffix}`);
  await page.getByPlaceholder("品牌").fill("Apple");
  await page.getByPlaceholder("型号").fill("IPHONE 15");
  await page.getByPlaceholder("维修备注").fill(`手机老板速览 smoke ${suffix}`);
  await page.getByPlaceholder("项目名称").fill(`屏幕 smoke ${suffix}`);
  await page.getByPlaceholder("数量").fill("1");
  await page.getByPlaceholder("单价").fill("88");
  await page.locator(".price-row button").click();
  await page.getByRole("button", { name: "保存" }).click();
  await page.getByRole("heading", { name: "维修单" }).waitFor();
  await page.locator('[data-smoke="mobile-order-card"]').first().waitFor();
  if (!await page.locator('[data-smoke="mobile-technician-rank-card"]').count()) {
    const card = page.locator('[data-smoke="mobile-order-card"]').first();
    await card.getByRole("button", { name: /操作/ }).click();
    await card.locator(".mobile-order-action-panel").waitFor();
    await card.locator(".repair-technician-inline .picker-trigger").click();
    const options = page.getByRole("listbox").locator(".ui-select-option:not(:disabled)");
    const count = await options.count();
    if (count < 2) throw new Error("没有可分配的维修师，无法验收维修师统计");
    await options.nth(1).click();
    await page.locator('[data-smoke="mobile-technician-rank-card"]').first().waitFor();
  }
}

async function assertNoHorizontalOverflow(page, name) {
  const overflow = await page.evaluate(() => {
    const root = document.scrollingElement || document.documentElement;
    return Math.ceil(root.scrollWidth) - Math.ceil(window.innerWidth);
  });
  if (overflow > 2) throw new Error(`${name} 横向溢出 ${overflow}px`);
}

async function openEditableOrderCard(page) {
  const cards = page.locator('[data-smoke="mobile-order-card"]');
  const count = await cards.count();
  for (let index = 0; index < count; index += 1) {
    const card = cards.nth(index);
    if (!await card.isVisible()) continue;
    const actionButton = card.getByRole("button", { name: /操作/ }).first();
    if (!await actionButton.count() || !await actionButton.isVisible()) continue;
    if (await card.locator(".mobile-order-action-panel").count()) {
      await actionButton.click();
    }
    await actionButton.click();
    await card.locator(".mobile-order-action-panel").waitFor();
    if (await card.locator(".status-select").count() && await card.locator(".repair-technician-inline").count()) return card;
    await actionButton.click();
  }
  throw new Error("没有找到可编辑的订单卡");
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true
});
const page = await context.newPage();
page.on("dialog", (dialog) => dialog.accept());
page.setDefaultTimeout(10000);

await step("登录", async () => {
  await login(page);
});

await step("订单页速览、日期、状态和订单卡", async () => {
  await ensureMobileOrder(page);
  await page.locator('[data-smoke="mobile-boss-summary"]').waitFor();
  await page.locator(".date-range-filter").waitFor();
  await page.locator(".filter-pill", { hasText: "维修中" }).first().click();
  const card = page.locator('[data-smoke="mobile-order-card"]').first();
  await card.waitFor();
  await card.locator(".mobile-order-ticket").waitFor();
  await card.locator(".mobile-order-meta").waitFor();
  if (await card.locator(".mobile-order-action-panel").count()) throw new Error("订单卡默认展开了操作区");
  const editableCard = await openEditableOrderCard(page);
  await editableCard.locator(".status-select").waitFor();
  await editableCard.locator(".repair-technician-inline").waitFor();
  await assertNoHorizontalOverflow(page, "订单页");
});

await step("订单页维修师统计卡片", async () => {
  await page.locator('[data-smoke="mobile-repair-technician-rank"]').waitFor();
  await page.locator('[data-smoke="mobile-technician-rank-card"]').first().waitFor();
  await assertNoHorizontalOverflow(page, "订单页维修师统计");
});

await step("维修师列表手机统计卡", async () => {
  await go(page, "/dashboard/technicians", "维修师");
  await page.locator('[data-smoke="mobile-technicians-list"]').waitFor();
  await page.locator('[data-smoke="mobile-technician-card"]').first().waitFor();
  await page.locator('[data-smoke="mobile-technician-card"]').first().getByRole("button", { name: /操作/ }).click();
  await page.locator(".mobile-technician-action-panel").first().waitFor();
  await assertNoHorizontalOverflow(page, "维修师列表");
});

await step("维修师详情手机订单卡", async () => {
  await go(page, "/dashboard/repairs", "维修单");
  await page.locator('[data-smoke="mobile-technician-rank-card"]').first().click();
  await page.locator(".technician-orders-page").waitFor();
  await page.locator('[data-smoke="mobile-technician-order-cards"]').waitFor();
  await page.locator('[data-smoke="mobile-order-card"]').first().waitFor();
  await page.locator('[data-smoke="mobile-order-card"]').first().getByRole("button", { name: /操作/ }).click();
  await page.locator(".mobile-order-action-panel").first().waitFor();
  await assertNoHorizontalOverflow(page, "维修师详情");
});

await browser.close();

const failed = results.filter((item) => !item.ok);
for (const item of results) {
  console.log(`${item.ok ? "PASS" : "FAIL"} ${item.name}${item.error ? ` - ${item.error}` : ""}`);
}
if (failed.length) {
  process.exitCode = 1;
}
