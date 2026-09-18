#!/usr/bin/env node
// 统一的数据库初始化 / 升级序列（新装与旧库升级共用，Docker、Plesk、VPS 都调用它）：
//   预检 → prisma migrate deploy → prisma db seed（空库首位系统主管理员）→ bootstrap-system-admin --from-env（旧库升级）→ check-system-admin
// 任一步失败即非零退出并停止，不会把半完成的升级当作成功。
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadDotEnv } from "./load-env.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadDotEnv(root);

if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.startsWith("mysql://")) {
  console.error("✗ 请先在 .env 里设置 DATABASE_URL=mysql://...");
  process.exit(1);
}

const steps = [
  ["node", ["scripts/db-preflight.mjs"]],
  ["npx", ["prisma", "migrate", "deploy", "--schema", "prisma/schema.prisma"]],
  ["npx", ["prisma", "db", "seed", "--schema", "prisma/schema.prisma"]],
  ["node", ["scripts/portal-admin.mjs", "bootstrap-system-admin", "--from-env"]],
  ["node", ["scripts/portal-admin.mjs", "check-system-admin"]]
];

for (const [command, args] of steps) {
  console.log(`\n> ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", env: process.env, shell: process.platform === "win32" });
  if (result.status !== 0) {
    console.error(`✗ 步骤失败（退出码 ${result.status}），已停止。请勿在此状态下开放业务访问。`);
    process.exit(result.status || 1);
  }
}
console.log("\n✓ 数据库初始化 / 升级完成。");
