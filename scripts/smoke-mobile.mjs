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
  if (entry === "dashboard") {
    if (await page.getByRole("heading", { name: "Reparaciones" }).count()) {
      await page.locator(".sidebar-bottom .ui-select").click();
      await page.getByRole("listbox").getByRole("button", { name: "中文" }).click();
    }
    await page.getByRole("heading", { name: "维修单" }).waitFor();
    return;
  }
  await page.getByPlaceholder("账号").fill(smokeUsername);
  await page.getByPlaceholder("密码").fill(smokePassword);
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

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true
});
const page = await context.newPage();
page.on("dialog", (dialog) => dialog.accept());
page.setDefaultTimeout(9000);

await login(page);

await step("手机底部导航和维修单卡片布局", async () => {
  const sidebarBox = await page.locator(".sidebar").boundingBox();
  if (!sidebarBox || sidebarBox.y < 760 || sidebarBox.height < 56) throw new Error("底部导航位置不正确");

  await page.locator('[data-smoke="mobile-order-card"]').first().waitFor();
  const bottomLabels = await page.locator(".side-menu > .side-item span, .mobile-menu-wrap > summary span").evaluateAll((nodes) => nodes
    .filter((node) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width > 1 && rect.height > 1 && style.display !== "none" && style.visibility !== "hidden";
    })
    .map((node) => node.textContent.trim())
    .filter(Boolean));
  const expectedLabels = ["维修单", "保修单", "报表", "财务", "菜单"];
  if (expectedLabels.some((label, index) => bottomLabels[index] !== label)) throw new Error(`底部导航不是老板速览入口：${bottomLabels.join(" / ")}`);

  await page.getByRole("button", { name: "报表" }).click({ force: true });
  await page.getByRole("heading", { name: "报表" }).waitFor();
  await page.getByRole("button", { name: "财务" }).click({ force: true });
  await page.getByRole("heading", { name: "财务" }).waitFor();
  await page.getByRole("button", { name: "维修单" }).click({ force: true });
  await page.locator('[data-smoke="mobile-order-card"]').first().waitFor();
});

await step("手机菜单可进入设置和备份", async () => {
  await page.locator(".mobile-menu-wrap > summary").click({ force: true });
  await page.locator(".mobile-menu-panel").waitFor();
  await page.locator(".mobile-menu-card", { hasText: "设置" }).click();
  await page.locator("h1", { hasText: "设置" }).waitFor();
  await page.locator(".mobile-menu-wrap > summary").click({ force: true });
  await page.locator(".mobile-menu-card", { hasText: "备份" }).click();
  await page.locator("h1", { hasText: "备份" }).waitFor();
});

let createdTicket = "";
let publicToken = "";

await step("手机新增维修单并保存", async () => {
  await page.evaluate(() => {
    window.location.hash = "/dashboard/repairs/new";
  });
  await page.waitForFunction(() => location.hash === "#/dashboard/repairs/new");
  await page.getByPlaceholder("先输入客户电话搜索").fill(`677${suffix}`);
  await page.getByPlaceholder("客户姓名").fill(`手机客户${suffix}`);
  await page.getByPlaceholder("品牌").fill("Apple");
  await page.getByPlaceholder("型号").fill("IPHONE 15 PRO");
  await page.getByPlaceholder("维修备注").fill(`手机端测试维修 ${suffix}`);
  await page.getByPlaceholder("项目名称").fill(`手机端项目 ${suffix}`);
  await page.getByPlaceholder("数量").fill("1");
  await page.getByPlaceholder("单价").fill("66");
  await page.locator(".price-row button").click();
  await page.locator(".price-save-actions .ui-button").last().click();
  await page.getByRole("heading", { name: "维修单" }).waitFor();

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const exported = await (await page.request.get(`${baseUrl}/api/backup/export`)).json();
    if (!exported.data) throw new Error(exported.error || "导出接口没有返回数据");
    const client = exported.data.clients.find((item) => item.phone === `677${suffix}`);
    const repair = exported.data.repairs.find((item) => item.clientId === client?.id);
    if (repair?.ticket && repair?.publicToken) {
      createdTicket = repair.ticket;
      publicToken = repair.publicToken;
      break;
    }
    await page.waitForTimeout(500);
  }
  if (!createdTicket || !publicToken) throw new Error("手机新增维修单没有保存成功");
});

await step("手机公开维修进度页可读", async () => {
  await page.goto(`${baseUrl}/status/${publicToken}`);
  await page.getByText(createdTicket).waitFor();
  const cardBox = await page.locator(".public-card").boundingBox();
  if (!cardBox || cardBox.width > 390) throw new Error("公开进度页在手机端溢出");
});

await browser.close();

const failed = results.filter((item) => !item.ok);
for (const item of results) {
  console.log(`${item.ok ? "PASS" : "FAIL"} ${item.name}${item.error ? ` - ${item.error}` : ""}`);
}
if (failed.length) {
  process.exitCode = 1;
}
