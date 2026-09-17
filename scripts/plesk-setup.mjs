import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadDotEnv } from "./load-env.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
loadDotEnv(root);

const env = { ...process.env, NODE_ENV: "production", REPAIRNOTE_COOKIE_SECURE: process.env.REPAIRNOTE_COOKIE_SECURE || "true" };
Object.assign(process.env, env);

if (!env.DATABASE_URL || !env.DATABASE_URL.startsWith("mysql://")) {
  console.error("✗ Plesk 版使用 MySQL/MariaDB。请先在 .env 里设置 DATABASE_URL=mysql://...");
  process.exit(1);
}
if (!env.REPAIRNOTE_PUBLIC_ORIGIN) {
  console.error("✗ 请在 .env 里设置 REPAIRNOTE_PUBLIC_ORIGIN（浏览器访问本系统的 https 地址，例如 https://repair.example.com）");
  process.exit(1);
}

function run(command, args) {
  console.log(`\n> ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", env, shell: process.platform === "win32" });
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log("RepairNOTE Plesk 初始化：MySQL/MariaDB + 多门户");
console.log("新装：首位管理员来自 .env 的 REPAIRNOTE_ADMIN_USERNAME / REPAIRNOTE_ADMIN_PASSWORD（必须是真实密码）。");
console.log("旧库升级：必须先设置 REPAIRNOTE_SYSTEM_ADMIN_STAFF_ID，见 docs/多门户升级与运维说明.md。");

run("npx", ["prisma", "generate", "--schema", "prisma/schema.prisma"]);
run("node", ["scripts/db-setup.mjs"]);
run("npx", ["next", "build"]);

console.log("\nPlesk 初始化完成。请在 Plesk 里重启 Node.js 应用。");
