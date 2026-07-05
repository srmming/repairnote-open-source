import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const stamp = new Date().toISOString().slice(0, 10);
const packageName = `RepairNOTE-Plesk-MySQL版-${stamp}.zip`;

const includes = [
  "package.json",
  "package-lock.json",
  "next.config.mjs",
  "jsconfig.json",
  ".node-version",
  "server.js",
  "src",
  "prisma",
  ".env.plesk.example",
  "Plesk部署说明.md",
  "scripts/plesk-setup.mjs",
  "scripts/mysql-setup.mjs",
  "scripts/load-env.mjs",
  "MySQL迁移说明.md"
].filter((item) => existsSync(path.join(root, item)));

const excludes = [
  "prisma/*.db",
  "prisma/*.db-journal",
  "prisma/*.db-wal",
  "prisma/*.db-shm",
  ".DS_Store",
  "*/.DS_Store",
  "index.html",
  "app.js",
  "styles.css"
];

if (!includes.length) {
  console.error("打包失败：没有找到可打包文件。");
  process.exit(1);
}

rmSync(path.join(root, packageName), { force: true });

const args = ["-r", packageName, ...includes, ...excludes.flatMap((item) => ["-x", item])];
const result = spawnSync("zip", args, {
  cwd: root,
  stdio: "inherit"
});

if (result.status !== 0) {
  console.error("打包失败：请确认服务器或本机已安装 zip 命令。");
  process.exit(result.status || 1);
}

console.log(`\n已生成 Plesk MySQL 安装包：${packageName}`);
console.log("安装包已排除旧静态文件和非 MySQL 遗留资料。");
