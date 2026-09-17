#!/usr/bin/env node
// 数据库迁移预检（替代旧的 prisma-baseline.mjs 盲标基线）：
// 1. 空库：直接通过（新装）。
// 2. 有旧表但没有迁移记录：逐表比较列结构与初始迁移（20260703000000_init）是否完全一致；一致才标记该初始迁移为已执行，否则列出差异并停止。
// 3. 已执行初始迁移、尚未执行多门户迁移（旧单门户库）：必须通过 REPAIRNOTE_SYSTEM_ADMIN_STAFF_ID 指定真实、原本就是管理员的账号；
//    同时检查悬空的保修来源引用；任一不满足即非零退出，不进入结构迁移。
// 4. 已执行多门户迁移：只报告状态。
import { spawnSync } from "node:child_process";
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

// 初始迁移建立的表与列（名称集合），用于判断“旧库结构是否完整”。
const INIT_COLUMNS = {
  Staff: ["id", "name", "username", "email", "passwordHash", "isAdmin", "pagePermissions", "sessionTokenHash", "sessionExpiresAt", "createdAt", "updatedAt"],
  StaffSession: ["id", "staffId", "tokenHash", "expiresAt", "createdAt", "updatedAt"],
  Client: ["id", "name", "docType", "identity", "email", "phone", "address", "comment", "level", "createdAt", "updatedAt"],
  Brand: ["id", "name", "sortOrder", "createdAt", "updatedAt"],
  Model: ["id", "brandId", "name", "sortOrder", "createdAt", "updatedAt"],
  Service: ["id", "defaultName", "category", "zh", "es", "price", "sortOrder", "createdAt", "updatedAt"],
  Part: ["id", "defaultName", "category", "zh", "es", "price", "sortOrder", "createdAt", "updatedAt"],
  Technician: ["id", "name", "phone", "email", "color", "active", "sortOrder", "createdAt", "updatedAt"],
  AttributeGroup: ["id", "name", "createdAt", "updatedAt"],
  Attribute: ["id", "groupId", "defaultName", "zh", "es", "sortOrder", "createdAt", "updatedAt"],
  Repair: ["id", "ticket", "clientId", "brand", "model", "properties", "imei", "issue", "internalNote", "passwordType", "passwordText", "passwordPattern", "status", "repairTime", "warrantyStart", "technicianId", "technicianName", "budget", "deposit", "paymentMethod", "discountAmount", "costAmount", "frontPhoto", "backPhoto", "signatureDataUrl", "signedAt", "publicToken", "orderType", "sourceRepairId", "warrantyReason", "warrantyDiagnosis", "warrantyResolution", "warrantyChargeable", "statusHistory", "notificationLog", "searchText", "ticketSort", "createdAt", "updatedAt"],
  RepairItem: ["id", "repairId", "name", "qty", "price", "cost", "createdAt", "updatedAt"],
  Payment: ["id", "repairId", "amount", "method", "note", "paidAt", "createdBy", "createdAt", "updatedAt"],
  Setting: ["id", "value", "updatedAt"],
  BackupSnapshot: ["id", "kind", "reason", "data", "counts", "createdBy", "createdAt"]
};
const INIT_INDEXES = ["Staff_username_key", "StaffSession_tokenHash_key", "Brand_name_key", "Technician_name_key", "AttributeGroup_name_key", "Repair_ticket_key", "Repair_publicToken_key", "Repair_searchText_idx"];
const INIT_FOREIGN_KEYS = ["StaffSession_staffId_fkey", "Model_brandId_fkey", "Attribute_groupId_fkey", "Repair_clientId_fkey", "RepairItem_repairId_fkey", "Payment_repairId_fkey"];

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
    exitCode = await checkUpgradePreconditions();
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

async function compareInitStructure() {
  const diff = [];
  const tables = await listTables();
  for (const [table, expected] of Object.entries(INIT_COLUMNS)) {
    if (!tables.includes(table)) {
      diff.push(`缺少表 ${table}`);
      continue;
    }
    const actual = await listColumns(table);
    for (const column of expected) if (!actual.includes(column)) diff.push(`表 ${table} 缺少列 ${column}`);
    for (const column of actual) if (!expected.includes(column)) diff.push(`表 ${table} 多出列 ${column}`);
  }
  const indexes = await listIndexNames();
  for (const name of INIT_INDEXES) if (!indexes.includes(name)) diff.push(`缺少索引 ${name}`);
  const foreignKeys = await listForeignKeys();
  for (const name of INIT_FOREIGN_KEYS) if (!foreignKeys.includes(name)) diff.push(`缺少外键 ${name}`);
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
