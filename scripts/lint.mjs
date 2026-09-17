// 真正的静态检查（不是 next build）：用 TypeScript 编译器对 JS 源码做语法 / 未解析导入检查，
// 并检查业务 API 路由是否都经过 requirePortalContext / requireSystemAdmin。
import { spawnSync } from "node:child_process";
import fs, { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let failed = false;

// tsc 只做语法 / 模块解析检查（allowJs、checkJs=false），路径别名与 jsconfig 一致。
const tsconfigPath = path.join(root, ".lint.tsconfig.json");
fs.writeFileSync(tsconfigPath, JSON.stringify({
  compilerOptions: { allowJs: true, checkJs: false, noEmit: true, jsx: "preserve", module: "esnext", moduleResolution: "bundler", target: "es2022", baseUrl: ".", paths: { "@/*": ["src/*"] }, skipLibCheck: true, resolveJsonModule: true },
  include: ["src/**/*.js", "src/**/*.jsx", "scripts/**/*.mjs", "prisma/seed.js"]
}, null, 2));
const tsc = spawnSync("npx", ["tsc", "-p", tsconfigPath], { cwd: root, encoding: "utf8", shell: process.platform === "win32" });
fs.rmSync(tsconfigPath, { force: true });
if (tsc.status !== 0) {
  console.error(tsc.stdout || tsc.stderr);
  failed = true;
} else {
  console.log("✓ tsc 语法 / 模块解析检查通过");
}

// 路由授权检查：src/app/api 下每个 route.js 必须引用 requirePortalContext / requireSystemAdmin / requireStaff / getCurrentStaff 之一
function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}
const guards = ["requirePortalContext", "requireSystemAdmin", "systemRead", "systemWrite", "requireStaff", "getCurrentStaff", "clearSession", "createSession", "collectionRoute"];
for (const file of walk(path.join(root, "src/app/api")).filter((file) => file.endsWith("route.js"))) {
  const source = readFileSync(file, "utf8");
  if (!guards.some((guard) => source.includes(guard))) {
    console.error(`✗ ${path.relative(root, file)} 没有任何鉴权入口`);
    failed = true;
  }
  if (/prisma\.setting\.findUnique\(\{ where: \{ id: "main" \}/.test(source)) {
    console.error(`✗ ${path.relative(root, file)} 仍读取全局 main 设置`);
    failed = true;
  }
}
if (!failed) console.log("✓ API 路由鉴权入口检查通过");
process.exit(failed ? 1 : 0);
