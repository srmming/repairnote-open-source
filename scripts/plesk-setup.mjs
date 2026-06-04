import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadDotEnv } from "./load-env.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
loadDotEnv(root);

const env = {
  ...process.env,
  NODE_ENV: "production",
  REPAIRNOTE_ADMIN_USERNAME: process.env.REPAIRNOTE_ADMIN_USERNAME || "admin",
  REPAIRNOTE_ADMIN_PASSWORD: process.env.REPAIRNOTE_ADMIN_PASSWORD || "admin123",
  REPAIRNOTE_COOKIE_SECURE: process.env.REPAIRNOTE_COOKIE_SECURE || "false"
};

Object.assign(process.env, env);

if (!env.DATABASE_URL || !env.DATABASE_URL.startsWith("mysql://")) {
  console.error("✗ Plesk 版现在使用 MySQL/MariaDB。请先在 .env 里设置 DATABASE_URL=mysql://...");
  process.exit(1);
}

function run(command, args) {
  console.log(`\n> ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    env,
    shell: process.platform === "win32"
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log("RepairNOTE Plesk 初始化：使用 MySQL/MariaDB 数据库");
console.log("默认管理员：admin / admin123（如已存在员工账号，不会覆盖）");

run("npx", ["prisma", "migrate", "deploy", "--schema", "prisma/schema.prisma"]);
run("npx", ["prisma", "generate", "--schema", "prisma/schema.prisma"]);
run("npx", ["prisma", "db", "seed", "--schema", "prisma/schema.prisma"]);
run("npx", ["next", "build"]);

console.log("\nPlesk 初始化完成。请在 Plesk 里重启 Node.js 应用。");
