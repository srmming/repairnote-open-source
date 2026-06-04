import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL;
const password = process.env.REPAIRNOTE_TEST_PASSWORD;

if (!baseUrl) throw new Error("BASE_URL is required");
if (!password) throw new Error("REPAIRNOTE_TEST_PASSWORD is required");

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1366, height: 900 } });
const page = await context.newPage();
page.setDefaultTimeout(12000);

try {
  await page.goto(baseUrl);
  await page.getByPlaceholder("账号").fill("ming");
  await page.getByPlaceholder("密码").fill(password);
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
  await page.goto(`${baseUrl}#/dashboard/backup`);
  await page.locator("h1", { hasText: /^备份$/ }).waitFor();

  const listRes = await page.request.get(`${baseUrl}/api/backup/list`);
  if (!listRes.ok()) throw new Error(`backup list failed ${listRes.status()}`);
  const listJson = await listRes.json();
  if (!Array.isArray(listJson.backups)) throw new Error("backup list missing backups array");

  const zipRes = await page.request.get(`${baseUrl}/api/backup/download/current`);
  if (!zipRes.ok()) throw new Error(`zip download failed ${zipRes.status()}`);
  const contentType = zipRes.headers()["content-type"] || "";
  const body = await zipRes.body();
  if (!contentType.includes("zip") || body.length < 100) {
    throw new Error(`bad zip response ${contentType} ${body.length}`);
  }

  console.log(`ONLINE_OK backupCount=${listJson.backups.length} zipBytes=${body.length}`);
} finally {
  await browser.close();
}
