import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { loadDotEnv } from "./load-env.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const migrationName = "20260703000000_init";

loadDotEnv(root);

if (!process.env.DATABASE_URL) process.exit(0);

const prisma = new PrismaClient();
let exitCode = 0;

try {
  const hasBusinessTables = await tableExists("Staff");
  if (hasBusinessTables && !await migrationApplied(migrationName)) {
    const result = spawnSync("npx", ["prisma", "migrate", "resolve", "--applied", migrationName, "--schema", "prisma/schema.prisma"], {
      cwd: root,
      stdio: "inherit",
      env: process.env,
      shell: process.platform === "win32"
    });
    exitCode = result.status || 0;
  }
} finally {
  await prisma.$disconnect();
}

process.exit(exitCode);

async function tableExists(tableName) {
  const rows = await prisma.$queryRaw`
    SELECT COUNT(*) AS count
    FROM information_schema.tables
    WHERE table_schema = DATABASE() AND table_name = ${tableName}
  `;
  return Number(rows?.[0]?.count || 0) > 0;
}

async function migrationApplied(migrationName) {
  if (!await tableExists("_prisma_migrations")) return false;
  const rows = await prisma.$queryRaw`
    SELECT COUNT(*) AS count
    FROM _prisma_migrations
    WHERE migration_name = ${migrationName} AND finished_at IS NOT NULL
  `;
  return Number(rows?.[0]?.count || 0) > 0;
}
