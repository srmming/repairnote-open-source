import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const smokeUsername = process.env.SMOKE_USERNAME || "ming";
const smokePassword = process.env.SMOKE_PASSWORD || "123456";
const suffix = String(Date.now()).slice(-6);
const results = [];
const prisma = new PrismaClient();

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
    await page.keyboard.press("Escape").catch(() => {});
  }
}

async function go(hash, heading) {
  await page.goto(`${baseUrl}#${hash}`);
  await page.getByRole("heading", { name: heading }).first().waitFor({ timeout: 10000 });
}

async function submitDialog() {
  const dialog = page.locator('[role="dialog"]');
  await dialog.locator('button:has-text("创建"), button:has-text("保存")').last().click();
  await dialog.waitFor({ state: "hidden", timeout: 60000 });
}

function addButton(name = "新增") {
  return page.getByRole("button", { name, exact: true }).first();
}

async function editFirstRowAction(rowText, buttonText = "编辑") {
  await page.waitForTimeout(300);
  const row = page.locator("tr", { hasText: rowText }).first();
  await row.locator("button", { hasText: buttonText }).first().click({ force: true });
}

async function filterCurrentList(text) {
  const search = page.locator(".toolbar input").first();
  await search.fill(text);
  await page.waitForTimeout(300);
}

async function setTextareaValue(value, selector = "textarea") {
  await page.locator(selector).first().evaluate((node, text) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setter.call(node, text);
    node.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
  }, value);
}

async function chooseUiSelect(scope, triggerName, optionName) {
  await scope.getByRole("button", { name: triggerName }).first().click();
  await page.getByRole("button", { name: optionName }).last().click();
}

async function waitForDashboard() {
  await Promise.race([
    page.getByRole("heading", { name: "维修单" }).waitFor(),
    page.getByRole("heading", { name: "Reparaciones" }).waitFor()
  ]);
}

async function ensureChineseUi() {
  if (await page.getByRole("heading", { name: "维修单" }).count()) return;
  await page.locator(".sidebar-bottom .ui-select").click();
  await page.getByRole("listbox").getByRole("button", { name: "中文" }).click();
  await page.getByRole("heading", { name: "维修单" }).waitFor();
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext();
const page = await context.newPage();
page.on("dialog", (dialog) => dialog.accept());
page.setDefaultTimeout(10000);

await page.goto(baseUrl);

await step("登录失败提示", async () => {
  await page.getByPlaceholder("账号").fill(smokeUsername);
  await page.getByPlaceholder("密码").fill("wrong-password");
  await page.getByRole("button", { name: "登录" }).click();
  await page.getByText("账号或密码不正确").waitFor();
});

await step("登录", async () => {
  await page.getByPlaceholder("账号").fill(smokeUsername);
  await page.getByPlaceholder("密码").fill(smokePassword);
  await page.getByRole("button", { name: "登录" }).click();
  await waitForDashboard();
  await ensureChineseUi();
});

await step("中西语界面切换", async () => {
  await page.locator(".sidebar-bottom .ui-select").click();
  await page.getByRole("listbox").getByRole("button", { name: "Español" }).click();
  await page.getByRole("heading", { name: "Reparaciones" }).waitFor();
  await page.locator(".sidebar-bottom .ui-select").click();
  await page.getByRole("listbox").getByRole("button", { name: "中文" }).click();
  await page.getByRole("heading", { name: "维修单" }).waitFor();
  await page.waitForTimeout(1200);
});

await step("客户新增、编辑、删除", async () => {
  await go("/dashboard/clients", "客户");
  await page.getByRole("button", { name: "新增" }).click();
  await page.getByPlaceholder("客户姓名").fill(`测试客户${suffix}`);
  await page.getByPlaceholder("电话", { exact: true }).fill(`699${suffix}`);
  await submitDialog();
  await filterCurrentList(`测试客户${suffix}`);
  await page.getByText(`测试客户${suffix}`).waitFor();
  await editFirstRowAction(`测试客户${suffix}`);
  await page.getByPlaceholder("地址", { exact: true }).fill(`测试地址${suffix}`);
  await submitDialog();
  await editFirstRowAction(`测试客户${suffix}`, "删除");
  await page.getByText(`测试客户${suffix}`).waitFor({ state: "detached" });
});

await step("品牌型号新增、编辑、删除", async () => {
  await go("/dashboard/categories", "品牌 / 型号");
  await page.getByRole("button", { name: "新增品牌" }).click();
  await page.getByPlaceholder("品牌").fill(`TESTBRAND${suffix}`);
  await submitDialog();
  await filterCurrentList(`TESTBRAND${suffix}`);
  await page.locator(".brand-list .brand-item", { hasText: `TESTBRAND${suffix}` }).first().click();
  await page.getByRole("button", { name: "新增型号" }).click();
  await page.getByPlaceholder("型号").fill(`MODEL${suffix}`);
  await submitDialog();
  await page.getByText(`MODEL${suffix}`).waitFor();
  await editFirstRowAction(`MODEL${suffix}`);
  await page.getByPlaceholder("型号").fill(`MODEL${suffix}X`);
  await submitDialog();
  await editFirstRowAction(`MODEL${suffix}X`, "删除");
  await page.getByText(`MODEL${suffix}X`).waitFor({ state: "detached" });
});

await step("服务新增、编辑、删除", async () => {
  await go("/dashboard/services", "服务");
  await addButton().click();
  await page.getByPlaceholder("默认名").fill(`Servicio test ${suffix}`);
  await page.getByPlaceholder("中文").fill(`测试服务${suffix}`);
  await page.getByPlaceholder("西语").fill(`Servicio prueba ${suffix}`);
  await page.getByPlaceholder("价格").fill("12");
  await submitDialog();
  await filterCurrentList(`测试服务${suffix}`);
  await page.locator("tr", { hasText: `测试服务${suffix}` }).first().waitFor();
  await editFirstRowAction(`测试服务${suffix}`);
  await page.getByPlaceholder("中文").fill(`测试服务${suffix}改`);
  await submitDialog();
  await editFirstRowAction(`测试服务${suffix}改`, "删除");
  await page.locator("tr", { hasText: `测试服务${suffix}改` }).waitFor({ state: "detached" });
});

await step("配件新增、编辑、删除", async () => {
  await go("/dashboard/modules", "配件");
  await addButton().click();
  await page.getByPlaceholder("默认名").fill(`Part test ${suffix}`);
  await page.getByPlaceholder("中文").fill(`测试配件${suffix}`);
  await page.getByPlaceholder("西语").fill(`Repuesto prueba ${suffix}`);
  await submitDialog();
  await filterCurrentList(`测试配件${suffix}`);
  await page.locator("tr", { hasText: `测试配件${suffix}` }).first().waitFor();
  await editFirstRowAction(`测试配件${suffix}`);
  await page.getByPlaceholder("中文").fill(`测试配件${suffix}改`);
  await submitDialog();
  await editFirstRowAction(`测试配件${suffix}改`, "删除");
  await page.locator("tr", { hasText: `测试配件${suffix}改` }).waitFor({ state: "detached" });
});

await step("属性新增、编辑、删除", async () => {
  await go("/dashboard/attributes", "属性");
  await addButton().click();
  await page.getByPlaceholder("默认名").fill(`Attr ${suffix}`);
  await page.getByPlaceholder("中文").fill(`测试属性${suffix}`);
  await page.getByPlaceholder("西语").fill(`Atributo ${suffix}`);
  await submitDialog();
  await filterCurrentList(`测试属性${suffix}`);
  await page.getByText(`测试属性${suffix}`).waitFor();
  await editFirstRowAction(`测试属性${suffix}`);
  await page.getByPlaceholder("中文").fill(`测试属性${suffix}改`);
  await submitDialog();
  await editFirstRowAction(`测试属性${suffix}改`, "删除");
  await page.getByText(`测试属性${suffix}改`).waitFor({ state: "detached" });
});

await step("员工新增、编辑、删除", async () => {
  await go("/dashboard/staff", "员工");
  await addButton().click();
  await page.getByPlaceholder("姓名").fill(`测试员工${suffix}`);
  await page.getByPlaceholder("用户名").fill(`staff${suffix}`);
  await page.getByPlaceholder("密码").fill("123456");
  await submitDialog();
  await filterCurrentList(`staff${suffix}`);
  await page.getByText(`staff${suffix}`).waitFor();
  await editFirstRowAction(`staff${suffix}`);
  await page.getByPlaceholder("邮箱").fill(`staff${suffix}@test.local`);
  await submitDialog();
  await editFirstRowAction(`staff${suffix}`, "删除");
  await page.getByRole("cell", { name: `staff${suffix}`, exact: true }).waitFor({ state: "detached" });
});

let createdTicket = "";
let createdToken = "";
let createdRepairId = "";
const technicianName = `测试维修师${suffix}`;

await step("维修师新增、编辑", async () => {
  await go("/dashboard/technicians", "维修师");
  await addButton().click();
  await page.getByPlaceholder("姓名").fill(technicianName);
  await page.getByPlaceholder("电话").fill(`677${suffix}`);
  await submitDialog();
  await filterCurrentList(technicianName);
  await page.getByText(technicianName).waitFor();
  await editFirstRowAction(technicianName);
  await page.getByPlaceholder("邮箱").fill(`tech${suffix}@test.local`);
  await submitDialog();
});

await step("新增维修单、价格项目、A4 和小票打印、保存", async () => {
  await go("/dashboard/repairs/new", "维修单 编辑");
  await page.getByPlaceholder("先输入客户电话搜索").fill(`688${suffix}`);
  await page.getByPlaceholder("客户姓名").fill(`开单客户${suffix}`);
  await page.getByPlaceholder("品牌").fill("Apple");
  await page.getByPlaceholder("型号").fill("IPHONE 13");
  await chooseUiSelect(page.getByRole("main"), "维修师", technicianName);
  await page.getByText("更换电池，三个月保修").click();
  await page.getByPlaceholder("维修备注").fill(`Cambiar bateria test ${suffix}`);
  await page.getByRole("button", { name: "创建" }).click();
  let repair = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const client = await prisma.client.findFirst({ where: { phone: `688${suffix}` } });
    repair = await prisma.repair.findFirst({ where: { clientId: client?.id }, orderBy: { createdAt: "desc" } });
    if (repair?.ticket && repair?.publicToken) break;
    await page.waitForTimeout(500);
  }
  if (!repair?.ticket || !repair?.publicToken) throw new Error("新维修单没有保存 ticket/publicToken");
  createdRepairId = repair.id;
  createdTicket = repair.ticket;
  createdToken = repair.publicToken;
  await go(`/dashboard/repairs/${createdRepairId}`, "维修单 编辑");
  await page.evaluate(() => {
    window.__printed = [];
    window.open = () => ({
      document: {
        open: () => {},
        write: (html) => window.__printed.push(html),
        close: () => {}
      },
      focus: () => {},
      print: () => window.__printed.push("PRINT_CALLED")
    });
  });
  await page.getByRole("button", { name: "打印 A4" }).click();
  await page.getByRole("button", { name: "打印小票" }).click();
  const printed = await page.evaluate(() => window.__printed);
  if (!printed.includes("PRINT_CALLED")) throw new Error("没有触发 print()");
});

await step("维修单详情编辑和状态流转", async () => {
  if (!createdRepairId) throw new Error("缺少新维修单 ID");
  await go(`/dashboard/repairs/${createdRepairId}`, "维修单 编辑");
  await page.getByPlaceholder("内部备注，不打印").fill(`内部备注${suffix}`);
  await page.getByRole("button", { name: "保存" }).last().click();
  await page.getByText("维修单已保存").waitFor();
});

await step("从已结束维修单创建保修单并编辑", async () => {
  const sourceRepair = await prisma.repair.findFirst({ where: { status: "已取走", orderType: "repair" }, orderBy: { createdAt: "asc" } });
  if (!sourceRepair) throw new Error("缺少可开保修单的已取走维修单");
  await go(`/dashboard/repairs/${sourceRepair.id}`, "维修单 编辑");
  await page.getByRole("button", { name: "开保修单" }).click();
  await page.getByPlaceholder("客户反馈问题").fill(`保修反馈${suffix}`);
  await page.getByPlaceholder("检测结果").fill(`检测结果${suffix}`);
  await page.getByPlaceholder("处理方式").fill(`处理方式${suffix}`);
  await page.getByRole("checkbox", { name: "需要收费" }).click();
  await page.getByPlaceholder("项目名称").fill(`保修收费项目${suffix}`);
  await page.getByPlaceholder("单价").fill("15");
  await page.getByPlaceholder("成本").last().fill("8");
  await page.getByRole("main").getByRole("button").filter({ hasText: /^$/ }).last().click();
  await page.getByRole("cell", { name: "7.00 €", exact: true }).waitFor();
  await page.getByRole("button", { name: "创建" }).click();
  await page.getByRole("heading", { name: "保修单" }).waitFor();
  await go("/dashboard/warranties", "保修单");
  await page.locator("tr", { hasText: `保修收费项目${suffix}` }).filter({ hasText: "15.00 €" }).waitFor();
  await page.locator("tr", { hasText: `保修收费项目${suffix}` }).first().click();
  await page.getByRole("heading", { name: "保修单 编辑" }).waitFor();
  await page.getByPlaceholder("处理方式").fill(`处理方式${suffix}改`);
  await page.getByRole("button", { name: "保存" }).click();
  await page.getByRole("heading", { name: "保修单" }).waitFor();
  await page.getByText(`保修反馈${suffix}`).waitFor();
});

await step("报表、设置、备份", async () => {
  await go("/dashboard/reports", "报表");
  await page.getByText("维修单数量").first().waitFor();
  await go("/dashboard/settings", "设置");
  await page.getByPlaceholder("联系电话").fill("600000000");
  await page.getByRole("button", { name: "保存" }).click();
  await page.getByText("设置已保存").waitFor();
  await go("/dashboard/backup", "备份");
  const exported = await (await page.request.get(`${baseUrl}/api/backup/export`)).json();
  if (!exported.data?.repairs?.length) throw new Error("导出备份缺少维修单数据");
  const badImport = await page.request.post(`${baseUrl}/api/backup/import`, { data: {} });
  if (badImport.status() !== 400) throw new Error("坏备份 JSON 没有被拦截");
});

await step("公开维修进度页", async () => {
  if (!createdToken) throw new Error("缺少 publicToken");
  await page.goto(`${baseUrl}/status/${createdToken}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.getByText(createdTicket).waitFor();
  await page.getByRole("heading", { name: "Estado de reparación" }).waitFor();
});

await browser.close();
await prisma.$disconnect();

const failed = results.filter((item) => !item.ok);
for (const item of results) {
  console.log(`${item.ok ? "PASS" : "FAIL"} ${item.name}${item.error ? ` - ${item.error}` : ""}`);
}
if (failed.length) {
  process.exitCode = 1;
}
