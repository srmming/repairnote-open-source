// 兼容旧命令名：基线处理已并入 scripts/db-preflight.mjs（完整结构比对，不再仅凭 Staff 表存在就标记初始迁移）。
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const result = spawnSync(process.execPath, [path.join(root, "scripts/db-preflight.mjs")], { cwd: root, stdio: "inherit", env: process.env });
process.exit(result.status || 0);
