const { createServer } = require("http");
const { existsSync, readFileSync } = require("fs");
const path = require("path");
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

process.env.REPAIRNOTE_ADMIN_USERNAME ||= "admin";
process.env.REPAIRNOTE_ADMIN_PASSWORD ||= "admin123";
process.env.REPAIRNOTE_COOKIE_SECURE ||= "false";

if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.startsWith("mysql://")) {
  console.error("RepairNOTE 现在只支持 MySQL/MariaDB。请先设置 DATABASE_URL=mysql://...");
  process.exit(1);
}

const port = Number.parseInt(process.env.PORT || "3000", 10);
const hostname = "0.0.0.0";
const app = next({ dev: false, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => {
    handle(req, res);
  }).listen(port, hostname, () => {
    console.log(`RepairNOTE ready on http://${hostname}:${port}`);
  });
});
