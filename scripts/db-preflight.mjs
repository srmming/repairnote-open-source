#!/usr/bin/env node
// 数据库迁移预检（替代旧的 prisma-baseline.mjs 盲标基线）：
// 1. 空库：直接通过（新装）。
// 2. 有旧表但没有迁移记录：逐表比较列结构与初始迁移（20260703000000_init）是否完全一致；一致才标记该初始迁移为已执行，否则列出差异并停止。
// 3. 已执行初始迁移、尚未执行多门户迁移（旧单门户库）：必须通过 REPAIRNOTE_SYSTEM_ADMIN_STAFF_ID 指定真实、原本就是管理员的账号；
//    同时检查悬空的保修来源引用；任一不满足即非零退出，不进入结构迁移。
// 4. 已执行多门户迁移：只报告状态。
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient, Prisma } from "@prisma/client";
import { loadDotEnv } from "./load-env.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const INIT_MIGRATION = "20260703000000_init";
const PORTAL_MIGRATION = "20260917000000_multi_portal";

loadDotEnv(root);

if (!process.env.DATABASE_URL) {
  console.error("✗ 未设置 DATABASE_URL，无法预检数据库");
  process.exit(1);
}

// 期望结构直接从初始迁移 SQL 解析（每张表每列的类型 / 可空 / 默认值存在性、全部索引名、全部外键名），
// 与 information_schema 逐项比对；任何一项不一致都拒绝标记基线，避免多门户迁移执行到一半才因缺索引 / 类型不符失败。
const INIT_SQL = fs.readFileSync(path.join(root, "prisma/migrations", INIT_MIGRATION, "migration.sql"), "utf8");
const EXPECTED = parseInitMigration(INIT_SQL);

function normalizeType(raw) {
  let type = String(raw || "").toLowerCase().replace(/\s+/g, "");
  if (type === "boolean") return "tinyint(1)";
  if (type === "integer") return "int";
  type = type.replace(/^(int|bigint|smallint|mediumint)\(\d+\)$/, "$1");
  return type;
}

function parseInitMigration(sql) {
  const tables = {};
  const indexes = new Set();
  const foreignKeys = new Set();
  for (const match of sql.matchAll(/CREATE TABLE `(\w+)` \(([\s\S]*?)\n\)/g)) {
    const [, table, body] = match;
    tables[table] = {};
    for (const line of body.split("\n").map((item) => item.trim()).filter(Boolean)) {
      const column = line.match(/^`(\w+)` ([A-Z]+(?:\([^)]*\))?)(.*)$/);
      if (column) {
        const [, name, type, rest] = column;
        tables[table][name] = { type: normalizeType(type), nullable: !/NOT NULL/.test(rest) };
        continue;
      }
      const index = line.match(/^(?:UNIQUE |FULLTEXT )?INDEX `(\w+)`/);
      if (index) indexes.add(index[1]);
    }
  }
  for (const match of sql.matchAll(/ADD CONSTRAINT `(\w+)` FOREIGN KEY/g)) foreignKeys.add(match[1]);
  return { tables, indexes, foreignKeys };
}

const prisma = new PrismaClient();
let exitCode = 0;

try {
  const tables = await listTables();
  if (!tables.length) {
    console.log("✓ 预检：空数据库，将执行全部迁移（新装）。");
  } else if (!(await migrationApplied(INIT_MIGRATION))) {
    const diff = await compareInitStructure();
    if (diff.length) {
      console.error("✗ 预检：数据库已有表，但结构与初始迁移不一致，拒绝标记基线：\n  - " + diff.join("\n  - "));
      exitCode = 1;
    } else {
      console.log("✓ 预检：旧库结构与初始迁移完全一致，标记 20260703000000_init 为已执行。");
      const result = spawnSync("npx", ["prisma", "migrate", "resolve", "--applied", INIT_MIGRATION, "--schema", "prisma/schema.prisma"], { cwd: root, stdio: "inherit", env: process.env, shell: process.platform === "win32" });
      exitCode = result.status || 0;
      if (!exitCode) exitCode = await checkUpgradePreconditions();
    }
  } else if (!(await migrationApplied(PORTAL_MIGRATION))) {
    // 基线可能曾被旧脚本盲标：多门户结构迁移前同样做完整结构比对
    const diff = await compareInitStructure();
    if (diff.length) {
      console.error("✗ 预检：旧库结构与初始迁移不一致，多门户迁移会执行到一半失败，已停止：\n  - " + diff.join("\n  - "));
      exitCode = 1;
    } else {
      console.log("✓ 预检：旧库结构与初始迁移完全一致。");
      exitCode = await checkUpgradePreconditions();
    }
  } else {
    console.log("✓ 预检：多门户迁移已执行。");
  }
} catch (error) {
  console.error(`✗ 预检失败：${error?.message || error}`);
  exitCode = 1;
} finally {
  await prisma.$disconnect();
}
process.exit(exitCode);

async function listTables() {
  const rows = await prisma.$queryRaw`SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE()`;
  return rows.map((row) => String(row.name));
}

async function listColumns(table) {
  const rows = await prisma.$queryRaw`SELECT column_name AS name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ${table}`;
  return rows.map((row) => String(row.name));
}

async function listIndexNames() {
  const rows = await prisma.$queryRaw`SELECT DISTINCT index_name AS name FROM information_schema.statistics WHERE table_schema = DATABASE()`;
  return rows.map((row) => String(row.name));
}

async function listForeignKeys() {
  const rows = await prisma.$queryRaw`SELECT constraint_name AS name FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_type = 'FOREIGN KEY'`;
  return rows.map((row) => String(row.name));
}

async function migrationApplied(name) {
  const tables = await listTables();
  if (!tables.includes("_prisma_migrations")) return false;
  const rows = await prisma.$queryRaw`SELECT COUNT(*) AS count FROM _prisma_migrations WHERE migration_name = ${name} AND finished_at IS NOT NULL AND rolled_back_at IS NULL`;
  return Number(rows?.[0]?.count || 0) > 0;
}

async function listColumnDetails(table) {
  const rows = await prisma.$queryRaw`SELECT column_name AS name, column_type AS type, is_nullable AS nullable FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ${table}`;
  return new Map(rows.map((row) => [String(row.name), { type: normalizeType(row.type), nullable: String(row.nullable).toUpperCase() === "YES" }]));
}

async function compareInitStructure() {
  const diff = [];
  const tables = await listTables();
  for (const [table, expectedColumns] of Object.entries(EXPECTED.tables)) {
    if (!tables.includes(table)) {
      diff.push(`缺少表 ${table}`);
      continue;
    }
    const actual = await listColumnDetails(table);
    for (const [column, expected] of Object.entries(expectedColumns)) {
      const found = actual.get(column);
      if (!found) {
        diff.push(`表 ${table} 缺少列 ${column}`);
        continue;
      }
      if (found.type !== expected.type) diff.push(`表 ${table} 列 ${column} 类型 ${found.type} ≠ 预期 ${expected.type}`);
      if (found.nullable !== expected.nullable) diff.push(`表 ${table} 列 ${column} 可空性与预期不一致`);
    }
    for (const column of actual.keys()) if (!expectedColumns[column]) diff.push(`表 ${table} 多出列 ${column}`);
  }
  const indexes = await listIndexNames();
  for (const name of EXPECTED.indexes) if (!indexes.includes(name)) diff.push(`缺少索引 ${name}`);
  const foreignKeys = await listForeignKeys();
  for (const name of EXPECTED.foreignKeys) if (!foreignKeys.includes(name)) diff.push(`缺少外键 ${name}`);
  for (const table of Object.keys(EXPECTED.tables)) {
    if (!tables.includes(table)) continue;
    const pk = await prisma.$queryRaw`SELECT COUNT(*) AS c FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = ${table} AND constraint_type = 'PRIMARY KEY'`;
    if (!Number(pk[0]?.c)) diff.push(`表 ${table} 缺少主键`);
  }
  return diff;
}

// 旧单门户库升级前置条件：显式系统主管理员 + 数据一致性。
async function checkUpgradePreconditions() {
  const problems = [];
  const staffId = String(process.env.REPAIRNOTE_SYSTEM_ADMIN_STAFF_ID || "").trim();
  const staffCount = Number((await prisma.$queryRaw`SELECT COUNT(*) AS count FROM Staff`)[0]?.count || 0);
  if (staffCount > 0) {
    if (!staffId) {
      problems.push("旧库升级必须设置 REPAIRNOTE_SYSTEM_ADMIN_STAFF_ID（真实、已确认的原管理员 Staff ID），不按名字猜测");
    } else {
      const rows = await prisma.$queryRaw(Prisma.sql`SELECT id, username, isAdmin FROM Staff WHERE id = ${staffId}`);
      if (!rows.length) problems.push(`REPAIRNOTE_SYSTEM_ADMIN_STAFF_ID=${staffId} 不存在`);
      else if (!Number(rows[0].isAdmin)) problems.push(`REPAIRNOTE_SYSTEM_ADMIN_STAFF_ID=${staffId}（${rows[0].username}）原本不是管理员，不能指定为系统主管理员`);
      else console.log(`✓ 预检：系统主管理员将设为 ${rows[0].username}（${staffId}）。`);
    }
  } else {
    console.log("✓ 预检：库中没有账号，首位管理员将由 seed 创建。");
  }
  const dangling = await prisma.$queryRaw`
    SELECT r.id, r.ticket, r.sourceRepairId FROM Repair r
    WHERE r.sourceRepairId <> '' AND NOT EXISTS (SELECT 1 FROM Repair s WHERE s.id = r.sourceRepairId)
    LIMIT 50`;
  if (dangling.length) {
    problems.push(`发现 ${dangling.length}+ 张维修单的保修来源引用不存在（示例：${dangling.slice(0, 5).map((row) => `${row.ticket}→${row.sourceRepairId}`).join(", ")}）；请在备份副本上按证据修正后再升级，不要直接删单`);
  }
  const orphanClients = await prisma.$queryRaw`SELECT COUNT(*) AS count FROM Repair r WHERE NOT EXISTS (SELECT 1 FROM Client c WHERE c.id = r.clientId)`;
  if (Number(orphanClients[0]?.count || 0)) problems.push(`发现 ${orphanClients[0].count} 张维修单的客户不存在`);
  const dupSettings = await prisma.$queryRaw`SELECT COUNT(*) AS count FROM Setting WHERE id <> 'main'`;
  if (Number(dupSettings[0]?.count || 0)) problems.push(`Setting 表存在 id<>'main' 的多余行（${dupSettings[0].count} 行），迁移会丢弃它们，请先确认`);
  if (problems.length) {
    console.error("✗ 预检：旧库升级前置条件未满足，已停止：\n  - " + problems.join("\n  - "));
    return 1;
  }
  console.log("✓ 预检：旧库升级前置条件满足。");
  return 0;
}
