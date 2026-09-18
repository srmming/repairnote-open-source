const { createServer } = require("http");
const { existsSync, readFileSync } = require("fs");
const path = require("path");
const compression = require("compression");
const next = require("next");

function loadDotEnv(root) {
  const envPath = path.join(root, ".env");
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const equalsIndex = line.indexOf("=");
    if (equalsIndex <= 0) continue;
    const key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadDotEnv(__dirname);

process.env.NODE_ENV ||= "production";

if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.startsWith("mysql://")) {
  console.error("RepairNOTE 现在只支持 MySQL/MariaDB。请先设置 DATABASE_URL=mysql://...");
  process.exit(1);
}

// 启动预检：REPAIRNOTE_PUBLIC_ORIGIN 必须是浏览器访问本系统的唯一 origin（系统管理写接口的同源校验只信任它）。
{
  const value = String(process.env.REPAIRNOTE_PUBLIC_ORIGIN || "").trim();
  let ok = false;
  try {
    const url = new URL(value);
    const localhost = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    const secureRequired = process.env.REPAIRNOTE_COOKIE_SECURE === "true" || (process.env.REPAIRNOTE_COOKIE_SECURE !== "false" && process.env.NODE_ENV === "production");
    ok = ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash && (url.pathname === "/" || !url.pathname)
      && (!secureRequired || url.protocol === "https:" || localhost);
  } catch {
    ok = false;
  }
  if (!ok) {
    console.error("RepairNOTE 启动失败：REPAIRNOTE_PUBLIC_ORIGIN 缺失或不合法。请设置为浏览器访问本系统的地址（不带路径），例如 https://repair.example.com；生产环境必须是 https。");
    process.exit(1);
  }
}

const port = Number.parseInt(process.env.REPAIRNOTE_PORT || process.env.PORT || "3000", 10);
const hostname = "0.0.0.0";
const app = next({ dev: false, hostname, port });
const handle = app.getRequestHandler();
const compress = compression();

app.prepare().then(() => {
  createServer((req, res) => {
    compress(req, res, () => handle(req, res));
  }).listen(port, hostname, () => {
    console.log(`RepairNOTE ready on http://${hostname}:${port}`);
  });
});
