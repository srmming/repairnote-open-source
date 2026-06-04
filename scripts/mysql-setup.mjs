import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadDotEnv } from "./load-env.mjs";

// MySQL / MariaDB 初始化：建表（migrate deploy）+ 生成客户端 + 首个管理员（幂等）+ 构建。
// 前提：已在 .env 里把 DATABASE_URL 设为 mysql://...（Plesk 自带通常是 MariaDB）。
//
// 当前项目已统一为 MySQL/MariaDB；旧 SQLite/PostgreSQL 迁移入口已废弃。

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
loadDotEnv(root);

const dbUrl = process.env.DATABASE_URL || "";
if (!/^mysql:\/\//.test(dbUrl)) {
  console.error("✗ DATABASE_URL 必须是 mysql:// 连接串。请先在 .env 里设置。当前：" + (dbUrl || "(空)"));
  process.exit(1);
}

function run(command, args) {
  console.log(`\n> ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", env: process.env, shell: process.platform === "win32" });
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log("RepairNOTE MySQL/MariaDB 初始化");
run("npx", ["prisma", "migrate", "deploy", "--schema", "prisma/schema.prisma"]);
run("npx", ["prisma", "generate", "--schema", "prisma/schema.prisma"]);
run("npx", ["prisma", "db", "seed"]);
run("npx", ["next", "build"]);
console.log("\n初始化完成。请在 Plesk 里重启 Node.js 应用。");
